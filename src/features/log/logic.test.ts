import { describe, expect, it } from 'vitest';
import { openDexieStore } from '@/data/dexieStore';
import type { LogEntry } from '@/data/types';
import {
  BABY_IDS,
  buildEntries,
  dayBounds,
  fromLocalInput,
  minutesBetween,
  planSleepToggle,
  splitMinutes,
  toLocalInput,
  type LogDraft,
} from './logic';

const diaper: LogDraft = { type: 'diaper', data: { kind: 'wet' }, start: '2026-10-11T10:00:00.000Z', end: null };

describe('buildEntries', () => {
  it('creates one entry for one twin, without a group', () => {
    const entries = buildEntries('A', diaper, 'p1', () => 'g1');
    expect(entries).toEqual([{ ...diaper, babyId: BABY_IDS.A, groupId: null, loggedBy: 'p1' }]);
  });

  it('creates two linked entries for "both"', () => {
    const entries = buildEntries('both', diaper, 'p2', () => 'g1');
    expect(entries.map((e) => [e.babyId, e.groupId, e.loggedBy])).toEqual([
      [BABY_IDS.A, 'g1', 'p2'],
      [BABY_IDS.B, 'g1', 'p2'],
    ]);
  });
});

const sleep = (babyId: string, end: string | null = null): LogEntry => ({
  id: `s-${babyId}`,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  deviceId: 'd',
  babyId,
  type: 'sleep',
  data: {},
  start: '2026-10-11T10:00:00.000Z',
  end,
  groupId: null,
  loggedBy: 'p1',
});

describe('planSleepToggle', () => {
  it('starts sleep for an awake twin', () => {
    expect(planSleepToggle('A', [])).toEqual({ stop: [], start: [BABY_IDS.A] });
  });

  it('stops sleep for a sleeping twin', () => {
    const a = sleep(BABY_IDS.A);
    expect(planSleepToggle('A', [a])).toEqual({ stop: [a], start: [] });
  });

  it('with both selected, only starts the one that is awake', () => {
    expect(planSleepToggle('both', [sleep(BABY_IDS.A)])).toEqual({ stop: [], start: [BABY_IDS.B] });
  });

  it('with both asleep, stops both', () => {
    const a = sleep(BABY_IDS.A);
    const b = sleep(BABY_IDS.B);
    expect(planSleepToggle('both', [a, b]).stop).toEqual([a, b]);
  });

  it('ignores finished sleeps', () => {
    expect(planSleepToggle('A', [sleep(BABY_IDS.A, '2026-10-11T11:00:00.000Z')]).start).toEqual([BABY_IDS.A]);
  });
});

describe('time helpers', () => {
  it('counts whole minutes and never goes negative', () => {
    expect(minutesBetween('2026-10-11T10:00:00Z', '2026-10-11T11:29:59Z')).toBe(89);
    expect(minutesBetween('2026-10-11T10:00:00Z', '2026-10-11T09:00:00Z')).toBe(0);
    expect(splitMinutes(89)).toEqual({ h: 1, m: 29 });
  });

  it('round-trips datetime-local values in local time', () => {
    const iso = new Date(2026, 9, 11, 14, 5).toISOString();
    expect(toLocalInput(iso)).toBe('2026-10-11T14:05');
    expect(fromLocalInput('2026-10-11T14:05')).toBe(iso);
    expect(fromLocalInput('nonsense')).toBeNull();
  });

  it('gives local day bounds', () => {
    const { from, to } = dayBounds(new Date(2026, 9, 11, 14, 5));
    expect(new Date(from)).toEqual(new Date(2026, 9, 11));
    expect(new Date(to)).toEqual(new Date(2026, 9, 12));
  });
});

describe('log repository queries', () => {
  let n = 0;
  const open = () => openDexieStore({ name: `log-test-${++n}` });
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 11, h, m)).toISOString();

  it('lists entries in a time range, oldest first, without deleted ones', async () => {
    const store = await open();
    const [a] = await store.logs.createMany([
      ...buildEntries('A', { ...diaper, start: at(9) }, 'p1', () => 'g'),
      ...buildEntries('both', { ...diaper, start: at(8) }, 'p1', () => 'g2'),
      ...buildEntries('B', { ...diaper, start: at(23) }, 'p1', () => 'g'),
    ]);
    await store.logs.remove(a.id);
    const list = await store.logs.listBetween(at(0), at(12));
    expect(list.map((e) => [e.start, e.babyId])).toEqual([
      [at(8), BABY_IDS.A],
      [at(8), BABY_IDS.B],
    ]);
  });

  it('finds the latest entry of a type per baby', async () => {
    const store = await open();
    await store.logs.createMany([
      ...buildEntries('A', { ...diaper, start: at(9) }, 'p1', () => 'g'),
      ...buildEntries('A', { ...diaper, start: at(11) }, 'p1', () => 'g'),
      ...buildEntries('A', { type: 'note', data: { text: 'x' }, start: at(12), end: null }, 'p1', () => 'g'),
    ]);
    expect((await store.logs.latest(BABY_IDS.A, 'diaper'))?.start).toBe(at(11));
    expect(await store.logs.latest(BABY_IDS.B, 'diaper')).toBeUndefined();
  });

  it('lists running timers only', async () => {
    const store = await open();
    await store.logs.createMany([
      ...buildEntries('A', { type: 'sleep', data: {}, start: at(9), end: null }, 'p1', () => 'g'),
      ...buildEntries('B', { type: 'sleep', data: {}, start: at(9), end: at(10) }, 'p1', () => 'g'),
      ...buildEntries('B', { type: 'feed', data: { method: 'breast', side: 'left' }, start: at(10), end: null }, 'p1', () => 'g'),
      ...buildEntries(
        'B',
        { type: 'feed', data: { method: 'bottle', ml: 60, milk: 'formula' }, start: at(10), end: null },
        'p1',
        () => 'g',
      ),
    ]);
    const running = await store.logs.listRunning(at(0));
    expect(running.map((e) => [e.type, e.babyId]).sort()).toEqual([
      ['feed', BABY_IDS.B],
      ['sleep', BABY_IDS.A],
    ]);
  });
});
