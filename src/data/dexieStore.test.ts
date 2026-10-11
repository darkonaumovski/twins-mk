import { describe, expect, it } from 'vitest';
import { openDexieStore } from './dexieStore';
import { exportBackup, importBackup, parseBackup, BackupError } from './backup';
import type { LogEntry, LogType, NewRecord, ParentTask, SharedSettings } from './types';

let dbCounter = 0;

/** A store on a fresh database with a controllable clock. */
async function makeStore(start = '2026-10-11T08:00:00.000Z') {
  let now = new Date(start);
  const store = await openDexieStore({ name: `test-${++dbCounter}`, now: () => now });
  return {
    store,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
}

const task = (title: string): NewRecord<ParentTask> => ({ title, assignee: 'p1', due: null, done: false, notes: '' });

describe('Dexie repository', () => {
  it('stamps metadata on create', async () => {
    const { store } = await makeStore();
    const created = await store.tasks.create(task('Buy diapers'));
    const device = await store.device.get();

    expect(created.id).toMatch(/[0-9a-f-]{36}/);
    expect(created.createdAt).toBe('2026-10-11T08:00:00.000Z');
    expect(created.updatedAt).toBe(created.createdAt);
    expect(created.deletedAt).toBeNull();
    expect(created.deviceId).toBe(device.deviceId);
    expect(await store.tasks.get(created.id)).toEqual(created);
  });

  it('bumps updatedAt on update, even within the same millisecond', async () => {
    const { store } = await makeStore();
    const created = await store.tasks.create(task('A'));
    const first = await store.tasks.update(created.id, { done: true });
    const second = await store.tasks.update(created.id, { title: 'B' });

    expect(first.updatedAt > created.updatedAt).toBe(true);
    expect(second.updatedAt > first.updatedAt).toBe(true);
    expect(second).toMatchObject({ title: 'B', done: true, createdAt: created.createdAt });
  });

  it('soft-deletes and restores (undo)', async () => {
    const { store, advance } = await makeStore();
    const a = await store.tasks.create(task('A'));
    await store.tasks.create(task('B'));

    advance(1000);
    await store.tasks.remove(a.id);
    expect((await store.tasks.list()).map((t) => t.title)).toEqual(['B']);
    expect(await store.tasks.get(a.id)).toBeUndefined();
    expect((await store.tasks.listAll()).find((t) => t.id === a.id)?.deletedAt).toBe('2026-10-11T08:00:01.000Z');

    await store.tasks.restore(a.id);
    expect((await store.tasks.list()).map((t) => t.title).sort()).toEqual(['A', 'B']);
  });

  it('throws when updating a missing record', async () => {
    const { store } = await makeStore();
    await expect(store.tasks.update('nope', { done: true })).rejects.toThrow(/not found/);
  });

  it('keeps the device id stable across reopen', async () => {
    const name = `test-reopen-${++dbCounter}`;
    const first = await openDexieStore({ name });
    const id = (await first.device.get()).deviceId;
    first.db.close();
    const second = await openDexieStore({ name });
    expect((await second.device.get()).deviceId).toBe(id);
  });
});

describe('settings', () => {
  it('returns defaults before anything is saved, without persisting them', async () => {
    const { store } = await makeStore();
    const s = await store.settings.get();
    expect(s).toMatchObject({ currency: 'MKD', dueDate: null, phase: 'prep' });
    expect(await store.settings.listAll()).toEqual([]);
  });

  it('persists updates', async () => {
    const { store } = await makeStore();
    await store.settings.update({ dueDate: '2027-01-20', currency: 'EUR' });
    expect(await store.settings.get()).toMatchObject({ dueDate: '2027-01-20', currency: 'EUR', phase: 'prep' });
    expect(await store.settings.listAll()).toHaveLength(1);
  });

  it('defaults device prefs to Macedonian, system theme, parent 1', async () => {
    const { store } = await makeStore();
    expect(await store.device.get()).toMatchObject({ language: 'mk', theme: 'system', parent: 'p1' });
    await store.device.update({ theme: 'dark' });
    expect((await store.device.get()).theme).toBe('dark');
  });
});

describe('live queries', () => {
  it('re-emits when data changes', async () => {
    const { store } = await makeStore();
    const seen: number[] = [];
    const sub = store.live(() => store.tasks.list()).subscribe({ next: (v) => seen.push(v.length) });
    await new Promise((r) => setTimeout(r, 20));
    await store.tasks.create(task('A'));
    await new Promise((r) => setTimeout(r, 20));
    sub.unsubscribe();
    expect(seen).toEqual([0, 1]);
  });
});

describe('backup round trip between two phones', () => {
  it('merges edits, additions and deletions from the other phone', async () => {
    const phone1 = await makeStore();
    const phone2 = await makeStore();

    // Phone 1 creates two tasks and shares them with phone 2.
    const a = await phone1.store.tasks.create(task('A'));
    const b = await phone1.store.tasks.create(task('B'));
    await importBackup(phone2.store, await exportBackup(phone1.store));
    expect((await phone2.store.tasks.list()).length).toBe(2);

    // Later, phone 2 completes A and deletes B; phone 1 adds C.
    phone2.advance(60_000);
    await phone2.store.tasks.update(a.id, { done: true });
    await phone2.store.tasks.remove(b.id);
    phone1.advance(30_000);
    await phone1.store.tasks.create(task('C'));

    const backup = parseBackup(JSON.stringify(await exportBackup(phone2.store)));
    const report = await importBackup(phone1.store, backup);

    expect(report.tasks).toEqual({ added: 0, updated: 2, unchanged: 0 });
    const titles = (await phone1.store.tasks.list()).map((t) => `${t.title}:${t.done}`).sort();
    expect(titles).toEqual(['A:true', 'C:false']);
  });

  it('does not let an older backup overwrite newer local edits', async () => {
    const { store, advance } = await makeStore();
    const a = await store.tasks.create(task('A'));
    const old = await exportBackup(store);
    advance(1000);
    await store.tasks.update(a.id, { title: 'A (edited)' });

    const report = await importBackup(store, old);
    expect(report.tasks).toEqual({ added: 0, updated: 0, unchanged: 1 });
    expect((await store.tasks.get(a.id))?.title).toBe('A (edited)');
  });

  it('includes shared settings but not device prefs', async () => {
    const phone1 = await makeStore();
    const phone2 = await makeStore();
    await phone1.store.settings.update({ dueDate: '2027-01-20' });
    await phone1.store.device.update({ language: 'en' });

    await importBackup(phone2.store, await exportBackup(phone1.store));
    expect((await phone2.store.settings.get()).dueDate).toBe('2027-01-20');
    expect((await phone2.store.device.get()).language).toBe('mk');
  });
});

describe('parseBackup', () => {
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return (e as BackupError).code;
    }
    return 'no error';
  };

  it('rejects malformed input', () => {
    expect(code(() => parseBackup('{oops'))).toBe('notJson');
    expect(code(() => parseBackup('{"app":"other","version":1,"data":{}}'))).toBe('notBackup');
    expect(code(() => parseBackup('{"app":"twins-mk","version":99,"data":{}}'))).toBe('newerVersion');
    expect(code(() => parseBackup('{"app":"twins-mk","version":1,"data":{"tasks":[{"id":"x"}]}}'))).toBe('invalidRecord');
  });

  it('ignores unknown collections', () => {
    const file = parseBackup('{"app":"twins-mk","version":1,"exportedAt":"x","data":{"aliens":[1]}}');
    expect(file.data).toEqual({});
  });
});

describe('data from newer versions', () => {
  const futureEntry = (id: string, start: string) =>
    ({
      id,
      type: 'hiccups',
      babyId: 'baby-A',
      start,
      end: null,
      groupId: null,
      loggedBy: 'p1',
      data: {},
      createdAt: start,
      updatedAt: start,
      deletedAt: null,
      deviceId: 'newer-phone',
    }) as unknown as LogEntry;

  it('keeps log entries of unknown types but leaves them out of queries', async () => {
    const { store } = await makeStore();
    const start = '2026-10-11T09:00:00.000Z';
    await store.logs.merge([futureEntry('future-1', start)]);
    await store.logs.create({ type: 'note', babyId: 'baby-A', start, end: null, groupId: null, loggedBy: 'p1', data: { text: 'hi' } });

    expect((await store.logs.listBetween('2026-10-11T00:00:00.000Z', '2026-10-12T00:00:00.000Z')).map((e) => e.type)).toEqual(['note']);
    expect(await store.logs.latest('baby-A', 'hiccups' as LogType)).toBeUndefined();
    expect(await store.logs.listRunning('2026-10-01T00:00:00.000Z')).toEqual([]);
    // Still stored and exported, so nothing is lost when this phone syncs or backs up.
    expect((await store.logs.listAll()).some((e) => e.id === 'future-1')).toBe(true);
    expect((await exportBackup(store)).data.logs?.some((e) => e.id === 'future-1')).toBe(true);
  });

  it('fills settings fields that an older version did not save', async () => {
    const { store } = await makeStore();
    const { expectedDelivery: _omit, ...old } = { ...(await store.settings.get()), createdAt: 'x', updatedAt: '2026-10-01T00:00:00.000Z' };
    await store.settings.merge([old as SharedSettings]);
    expect(await store.settings.get()).toMatchObject({ expectedDelivery: null });
  });
});
