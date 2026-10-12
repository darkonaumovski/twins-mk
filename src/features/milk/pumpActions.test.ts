import { describe, expect, it } from 'vitest';
import { openDexieStore } from '@/data/dexieStore';
import { exportBackup, importBackup } from '@/data/backup';
import type { Pump } from '@/data/types';
import { finishedPumps, isRunningPump, pumpedPerDay, pumpMinutes, runningPump } from './logic';
import { putInStash, saveSession, stashOfSession, startPump, stopPump } from './pumpActions';

let n = 0;
async function phone(start = '2026-10-11T08:00:00.000Z') {
  let now = new Date(start);
  const store = await openDexieStore({ name: `pump-${++n}`, now: () => now });
  return {
    store,
    at: (iso: string) => {
      now = new Date(iso);
      return now;
    },
  };
}

const manual = (over: Partial<Pump> = {}): Pump => ({
  id: 'm',
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  deviceId: 'd',
  start: '2026-10-11T06:00:00.000Z',
  minutes: 15,
  leftMl: null,
  rightMl: null,
  totalMl: 100,
  loggedBy: 'p1',
  ...over,
});

describe('pumping timer logic', () => {
  it('rounds minutes up, with at least one', () => {
    expect(pumpMinutes('2026-10-11T08:00:00.000Z', '2026-10-11T08:12:01.000Z')).toBe(13);
    expect(pumpMinutes('2026-10-11T08:00:00.000Z', '2026-10-11T08:12:00.000Z')).toBe(12);
    expect(pumpMinutes('2026-10-11T08:00:00.000Z', '2026-10-11T08:00:10.000Z')).toBe(1);
  });

  it('treats an older record without `end` as a finished session', () => {
    const old = manual();
    expect('end' in old).toBe(false);
    expect(isRunningPump(old)).toBe(false);
    expect(finishedPumps([old])).toEqual([old]);
    expect(runningPump([old])).toBeUndefined();
  });

  it('leaves a running timer out of the daily totals', () => {
    const day = [{ from: new Date('2026-10-11T00:00:00.000Z'), to: new Date('2026-10-12T00:00:00.000Z') }];
    // An older phone could have saved ml on a running timer; it still does not count until stopped.
    const running = manual({ id: 'r', end: null, minutes: null, totalMl: 40 });
    const stopped = manual({ id: 's', end: '2026-10-11T07:00:00.000Z', totalMl: 80 });
    expect(pumpedPerDay([manual(), running, stopped], day)).toEqual([180]);
    expect(runningPump([manual(), running, stopped])?.id).toBe('r');
    expect(finishedPumps([manual(), running, stopped]).map((p) => p.id)).toEqual(['m', 's']);
  });

  it('picks the newest of two running timers (two phones started one offline)', () => {
    const older = manual({ id: 'old', start: '2026-10-11T08:00:00.000Z', end: null, totalMl: 0 });
    const newer = manual({ id: 'new', start: '2026-10-11T08:05:00.000Z', end: null, totalMl: 0 });
    expect(runningPump([older, newer])?.id).toBe('new');
  });

  it('counts a session across midnight on the day it started, with the whole duration', () => {
    const start = new Date(2026, 9, 11, 23, 50).toISOString();
    const end = new Date(2026, 9, 12, 0, 10).toISOString();
    expect(pumpMinutes(start, end)).toBe(20);
    const day = (d: number) => ({ from: new Date(2026, 9, d), to: new Date(2026, 9, d + 1) });
    const session = manual({ start, end, minutes: 20, totalMl: 90 });
    expect(pumpedPerDay([session], [day(11), day(12)])).toEqual([90, 0]);
  });
});

describe('pumping timer in the store', () => {
  it('starts one timer per family, then stops it with the minutes filled in', async () => {
    const { store, at } = await phone();
    const { pump, started } = await startPump(store, 'both', 'p1', at('2026-10-11T08:00:00.000Z'));
    expect(started).toBe(true);
    expect(pump).toMatchObject({ end: null, side: 'both', minutes: null, totalMl: 0 });

    const again = await startPump(store, 'left', 'p2', at('2026-10-11T08:01:00.000Z'));
    expect(again).toEqual({ pump, started: false });
    expect(await store.pumps.list()).toHaveLength(1);

    const stopped = await stopPump(store, pump.id, at('2026-10-11T08:14:30.000Z'));
    expect(stopped).toMatchObject({ end: '2026-10-11T08:14:30.000Z', minutes: 15, totalMl: 0 });
    // Stopping again (e.g. a second tap) changes nothing.
    const updatedAt = stopped!.updatedAt;
    expect((await stopPump(store, pump.id, at('2026-10-11T08:20:00.000Z')))?.updatedAt).toBe(updatedAt);
    // A new timer can start now.
    expect((await startPump(store, 'left', 'p1', at('2026-10-11T09:00:00.000Z'))).started).toBe(true);
  });

  it('keeps one stash container when two phones stop and save the same session', async () => {
    const a = await phone();
    const b = await phone();
    const { pump } = await startPump(a.store, 'both', 'p1', a.at('2026-10-11T08:00:00.000Z'));
    await importBackup(b.store, await exportBackup(a.store));

    // Both phones stop it, a few seconds apart, while offline, and enter amounts.
    const fromA = await stopPump(a.store, pump.id, a.at('2026-10-11T08:15:00.000Z'));
    await a.store.pumps.update(pump.id, { leftMl: 60, rightMl: 50, totalMl: 110 });
    await putInStash(a.store, fromA!, 110, 'fridge');
    const fromB = await stopPump(b.store, pump.id, b.at('2026-10-11T08:15:20.000Z'));
    await b.store.pumps.update(pump.id, { leftMl: 60, rightMl: 60, totalMl: 120 });
    await putInStash(b.store, fromB!, 120, 'freezer');

    await importBackup(a.store, await exportBackup(b.store));
    await importBackup(b.store, await exportBackup(a.store));
    for (const { store } of [a, b]) {
      expect(await store.pumps.list()).toEqual([expect.objectContaining({ end: '2026-10-11T08:15:20.000Z', totalMl: 120 })]);
      const stash = await store.milkStash.list();
      expect(stash).toHaveLength(1);
      expect(stash[0]).toMatchObject({ ml: 120, location: 'freezer', pumpId: pump.id });
    }
  });

  it('does nothing when stopping a timer the other phone stopped or discarded', async () => {
    const a = await phone();
    const b = await phone();
    const { pump } = await startPump(a.store, 'both', 'p1', a.at('2026-10-11T08:00:00.000Z'));
    await importBackup(b.store, await exportBackup(a.store));
    const fromB = await stopPump(b.store, pump.id, b.at('2026-10-11T08:10:00.000Z'));
    await importBackup(a.store, await exportBackup(b.store));
    // A synced B's stop before tapping: no second write, B's end stays.
    expect(await stopPump(a.store, pump.id, a.at('2026-10-11T08:12:00.000Z'))).toEqual(fromB);

    const { pump: second } = await startPump(a.store, 'left', 'p1', a.at('2026-10-11T09:00:00.000Z'));
    await a.store.pumps.remove(second.id);
    expect(await stopPump(a.store, second.id, a.at('2026-10-11T09:05:00.000Z'))).toBeUndefined();
    expect((await a.store.pumps.listAll()).find((p) => p.id === second.id)?.end).toBeNull();
  });

  it('shows what the other phone saved when a late Stop wiped its amounts', async () => {
    const a = await phone();
    const b = await phone();
    const { pump } = await startPump(a.store, 'both', 'p1', a.at('2026-10-11T08:00:00.000Z'));
    await importBackup(b.store, await exportBackup(a.store));
    // A stops and saves 110 ml with the stash; B, not synced yet, stops a little later.
    const fromA = await stopPump(a.store, pump.id, a.at('2026-10-11T08:15:00.000Z'));
    await saveSession(a.store, {
      pump: fromA!,
      fields: { start: pump.start, minutes: 15, leftMl: 60, rightMl: 50, totalMl: 110 },
      loggedBy: 'p1',
      stash: 'fridge',
    });
    await stopPump(b.store, pump.id, b.at('2026-10-11T08:16:00.000Z'));
    await importBackup(a.store, await exportBackup(b.store));
    await importBackup(b.store, await exportBackup(a.store));
    // Newest wins on the whole record: the session lost A's ml, but the stash still has them,
    // and the sheet starts from there.
    expect((await b.store.pumps.get(pump.id))?.totalMl).toBe(0);
    expect(await stashOfSession(b.store, pump.id)).toMatchObject({ ml: 110, location: 'fridge' });
  });

  it('does not save a session the other phone deleted meanwhile', async () => {
    const { store, at } = await phone();
    const { pump } = await startPump(store, 'left', 'p1', at('2026-10-11T08:00:00.000Z'));
    const stopped = await stopPump(store, pump.id, at('2026-10-11T08:10:00.000Z'));
    await store.pumps.remove(pump.id);
    const saved = await saveSession(store, {
      pump: stopped!,
      fields: { start: pump.start, minutes: 10, leftMl: 80, rightMl: 0, totalMl: 80 },
      loggedBy: 'p1',
      stash: 'fridge',
    });
    expect(saved).toBeNull();
    expect(await store.milkStash.listAll()).toEqual([]);
  });

  it('saves a new session by hand with its stash container, like before', async () => {
    const { store } = await phone();
    const saved = await saveSession(store, {
      pump: null,
      fields: { start: '2026-10-11T07:00:00.000Z', minutes: 12, leftMl: null, rightMl: null, totalMl: 90 },
      loggedBy: 'p2',
      stash: 'freezer',
    });
    expect(saved?.pump).toMatchObject({ totalMl: 90, loggedBy: 'p2' });
    expect('end' in saved!.pump).toBe(false);
    expect(saved?.stash).toMatchObject({ ml: 90, location: 'freezer', pumpId: saved!.pump.id });
  });

  it('never brings used milk back into the stash', async () => {
    const { store, at } = await phone();
    const { pump } = await startPump(store, 'left', 'p1', at('2026-10-11T08:00:00.000Z'));
    const stopped = (await stopPump(store, pump.id, at('2026-10-11T08:10:00.000Z')))!;
    const item = await putInStash(store, stopped, 80, 'fridge');
    await store.milkStash.update(item.id, { usedAt: '2026-10-11T10:00:00.000Z' });
    expect(await putInStash(store, stopped, 100, 'fridge')).toMatchObject({ ml: 80, usedAt: '2026-10-11T10:00:00.000Z' });
  });

  it('brings back an undone stash container instead of adding a second', async () => {
    const { store, at } = await phone();
    const { pump: started } = await startPump(store, 'left', 'p1', at('2026-10-11T08:00:00.000Z'));
    const pump = (await stopPump(store, started.id, at('2026-10-11T08:10:00.000Z')))!;
    const first = await putInStash(store, pump, 50, 'fridge');
    await store.milkStash.remove(first.id);
    const again = await putInStash(store, pump, 70, 'fridge');
    expect(again.id).toBe(first.id);
    expect(await store.milkStash.list()).toEqual([expect.objectContaining({ ml: 70, deletedAt: null })]);
  });
});
