import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDexieStore, type DexieStore } from '../dexieStore';
import type { CollectionName } from '../repository';
import type { NewRecord, ParentTask } from '../types';
import { SyncEngine, formatCode, normalizeCode, type RemoteUpdate } from './engine';
import { MemoryServer, type MemoryRemote } from './memoryRemote';
import { SyncError, type SyncMembership } from './types';

let dbCounter = 0;
const engines: SyncEngine[] = [];

interface Phone {
  store: DexieStore;
  engine: SyncEngine;
  remote: MemoryRemote;
  advance(ms: number): void;
}

/** One phone: its own database, clock, server connection and sync engine. */
async function phone(server: MemoryServer, start = '2026-10-11T08:00:00.000Z'): Promise<Phone> {
  let now = new Date(start);
  const store = await openDexieStore({ name: `sync-${++dbCounter}`, now: () => now });
  const remote = server.client();
  const engine = new SyncEngine(store.sync, async () => remote, { debounceMs: 5, pollMs: 60_000, maxRetryMs: 20, now: () => now });
  engines.push(engine);
  return {
    store,
    engine,
    remote,
    advance(ms) {
      now = new Date(now.getTime() + ms);
    },
  };
}

afterEach(() => {
  engines.splice(0).forEach((e) => e.stop());
});

const task = (title: string): NewRecord<ParentTask> => ({ title, assignee: null, due: null, done: false, notes: '' });
const titles = async (p: Phone) => (await p.store.tasks.list()).map((t) => t.title).sort();

/** Two phones in one family, both syncing. */
async function family() {
  const server = new MemoryServer();
  const mom = await phone(server);
  const dad = await phone(server, '2026-10-11T08:00:00.500Z');
  const membership = await mom.engine.createFamily();
  mom.engine.start(membership);
  const joined = await dad.engine.joinFamily(formatCode(membership.code).toLowerCase());
  dad.engine.start(joined);
  await Promise.all([mom.engine.syncNow(), dad.engine.syncNow()]);
  return { server, mom, dad, membership };
}

describe('sync engine', () => {
  it('merges what both phones had when the second one joins', async () => {
    const server = new MemoryServer();
    const mom = await phone(server);
    const dad = await phone(server);
    await mom.store.tasks.create(task('Mom’s task'));
    await mom.store.settings.update({ parent1Name: 'Ana' });
    await dad.store.tasks.create(task('Dad’s task'));

    const membership = await mom.engine.createFamily();
    mom.engine.start(membership);
    await mom.engine.syncNow();

    const joined = await dad.engine.joinFamily(membership.code);
    expect(joined).toEqual(membership);
    dad.engine.start(joined);
    await dad.engine.syncNow();
    await mom.engine.syncNow();

    expect(await titles(mom)).toEqual(['Dad’s task', 'Mom’s task']);
    expect(await titles(dad)).toEqual(['Dad’s task', 'Mom’s task']);
    expect((await dad.store.settings.get()).parent1Name).toBe('Ana');
    expect(mom.engine.getSnapshot()).toMatchObject({ state: 'synced', pending: 0 });
  });

  it('shows a change on the other phone without anyone pressing anything', async () => {
    const { mom, dad } = await family();
    await vi.waitFor(() => expect(dad.engine.getSnapshot().live).toBe(true));

    await mom.store.logs.createMany([
      {
        type: 'diaper',
        data: { kind: 'wet' },
        babyId: 'baby-A',
        start: '2026-10-11T08:00:00.000Z',
        end: null,
        groupId: null,
        loggedBy: 'p1',
      },
    ]);

    await vi.waitFor(async () => expect(await dad.store.logs.list()).toHaveLength(1));
    const [entry] = await dad.store.logs.list();
    expect(entry).toMatchObject({ type: 'diaper', loggedBy: 'p1' });
    // Downloaded records are not queued to go back up.
    expect(await dad.store.sync.pending()).toEqual([]);
  });

  it('reports what the other phone changed, and marks the first merge after joining', async () => {
    const server = new MemoryServer();
    const mom = await phone(server);
    const dad = await phone(server);
    await mom.store.tasks.create(task('Before dad joined'));
    const membership = await mom.engine.createFamily();
    mom.engine.start(membership);
    await mom.engine.syncNow();

    const updates: RemoteUpdate[] = [];
    dad.engine.onRemoteChanges((u) => updates.push(u));
    dad.engine.start(await dad.engine.joinFamily(membership.code));
    await dad.engine.syncNow();
    expect(updates).toHaveLength(1);
    expect(updates[0].catchUp).toBe(true);

    const created = await mom.store.tasks.create(task('Buy wipes'));
    await mom.engine.syncNow();
    await vi.waitFor(() => expect(updates).toHaveLength(2));
    expect(updates[1]).toMatchObject({
      catchUp: false,
      changes: [{ collection: 'tasks', record: { id: created.id }, previous: undefined }],
    });

    mom.advance(1000);
    await mom.store.tasks.update(created.id, { done: true });
    await mom.engine.syncNow();
    await vi.waitFor(() => expect(updates).toHaveLength(3));
    expect(updates[2].changes[0]).toMatchObject({ record: { done: true }, previous: { done: false } });
  });

  it('propagates edits and deletes', async () => {
    const { mom, dad } = await family();
    const created = await mom.store.tasks.create(task('Buy wipes'));
    await mom.engine.syncNow();
    await dad.engine.syncNow();

    dad.advance(60_000);
    await dad.store.tasks.update(created.id, { done: true });
    await dad.engine.syncNow();
    await mom.engine.syncNow();
    expect((await mom.store.tasks.get(created.id))?.done).toBe(true);

    mom.advance(120_000);
    await mom.store.tasks.remove(created.id);
    await mom.engine.syncNow();
    await dad.engine.syncNow();
    expect(await dad.store.tasks.list()).toEqual([]);
  });

  it('skips collections from a newer version instead of failing', async () => {
    const { server, mom, dad, membership } = await family();
    // A phone with a newer version uploads a collection this version does not know.
    const future = { id: 'x1', createdAt: 'a', updatedAt: '2026-10-11T09:00:00.000Z', deletedAt: null, deviceId: 'newer', ml: 90 };
    server.push(membership.familyId, [{ collection: 'futureThings' as CollectionName, record: future }]);
    await mom.store.tasks.create(task('After the unknown record'));
    await mom.engine.syncNow();
    await dad.engine.syncNow();
    expect(dad.engine.getSnapshot().state).toBe('synced');
    expect(await titles(dad)).toEqual(['After the unknown record']);
  });

  it('keeps working offline and catches up afterwards', async () => {
    const { mom, dad } = await family();
    dad.remote.setOnline(false);

    await dad.store.tasks.create(task('Offline idea'));
    await dad.engine.syncNow();
    expect(dad.engine.getSnapshot()).toMatchObject({ state: 'offline', pending: 1 });

    await mom.store.tasks.create(task('Online idea'));
    await mom.engine.syncNow();

    dad.remote.setOnline(true);
    await vi.waitFor(() => expect(dad.engine.getSnapshot()).toMatchObject({ state: 'synced', pending: 0 }));
    await mom.engine.syncNow();

    expect(await titles(dad)).toEqual(['Offline idea', 'Online idea']);
    expect(await titles(mom)).toEqual(['Offline idea', 'Online idea']);
  });

  it('resolves the same record edited on both phones to the newest edit', async () => {
    const { mom, dad } = await family();
    const created = await mom.store.tasks.create(task('Pick a pram'));
    await mom.engine.syncNow();
    await dad.engine.syncNow();

    mom.remote.setOnline(false);
    dad.remote.setOnline(false);
    mom.advance(10_000);
    await mom.store.tasks.update(created.id, { title: 'Pick a twin pram' });
    dad.advance(20_000);
    await dad.store.tasks.update(created.id, { title: 'Pick a tandem pram' });

    mom.remote.setOnline(true);
    dad.remote.setOnline(true);
    await mom.engine.syncNow();
    await dad.engine.syncNow();
    await mom.engine.syncNow();

    expect(await titles(mom)).toEqual(['Pick a tandem pram']);
    expect(await titles(dad)).toEqual(['Pick a tandem pram']);
  });

  it('keeps an edit made while an upload was in flight', async () => {
    const { mom, dad } = await family();
    const created = await mom.store.tasks.create(task('A'));
    const push = mom.remote.push.bind(mom.remote);
    const spy = vi.spyOn(mom.remote, 'push').mockImplementationOnce(async (familyId, changes) => {
      // The user edits again while the first version is being uploaded.
      mom.advance(1000);
      await mom.store.tasks.update(created.id, { title: 'B' });
      return push(familyId, changes);
    });
    await mom.engine.syncNow();
    await mom.engine.syncNow();
    spy.mockRestore();
    await dad.engine.syncNow();
    expect(await titles(dad)).toEqual(['B']);
  });

  it('rejoins automatically when the phone’s sign-in was lost', async () => {
    const { server, mom, membership } = await family();
    // Same phone and data, but a new anonymous sign-in (e.g. cleared site data).
    const fresh = server.client();
    const engine = new SyncEngine(mom.store.sync, async () => fresh, { debounceMs: 5, maxRetryMs: 20 });
    engines.push(engine);
    mom.engine.stop();
    engine.start(membership);
    await mom.store.tasks.create(task('Still syncing'));
    await engine.syncNow();
    expect(engine.getSnapshot().state).toBe('synced');
  });

  it('reports a wrong code', async () => {
    const server = new MemoryServer();
    const mom = await phone(server);
    await expect(mom.engine.joinFamily('NOPE-NOPE-NOPE')).rejects.toEqual(new SyncError('notFound'));
  });

  it('stops sharing after leaving, and keeps the local data', async () => {
    const { mom, dad, membership } = await family();
    await mom.store.tasks.create(task('Shared'));
    await mom.engine.syncNow();
    await dad.engine.syncNow();

    await dad.engine.leave({ ...membership } as SyncMembership);
    expect(dad.engine.getSnapshot().state).toBe('off');
    await mom.store.tasks.create(task('After leaving'));
    await mom.engine.syncNow();
    await dad.engine.syncNow();
    expect(await titles(dad)).toEqual(['Shared']);
  });

  it('is unavailable without a configured server', async () => {
    const store = await openDexieStore({ name: `sync-${++dbCounter}` });
    const engine = new SyncEngine(store.sync, null);
    expect(engine.available).toBe(false);
    engine.start({ familyId: 'f', code: 'C' });
    expect(engine.getSnapshot().state).toBe('off');
  });
});

describe('join codes', () => {
  it('formats and normalises', () => {
    expect(formatCode('abcdefghjkmn')).toBe('ABCD-EFGH-JKMN');
    expect(normalizeCode(' abcd-efgh jkmn ')).toBe('ABCDEFGHJKMN');
  });
});
