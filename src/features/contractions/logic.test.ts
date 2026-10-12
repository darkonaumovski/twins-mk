import { describe, expect, it } from 'vitest';
import type { Contraction } from '@/data/types';
import { openDexieStore } from '@/data/dexieStore';
import { exportBackup, importBackup } from '@/data/backup';
import { contractionRows, formatSeconds, isFirstAfterGap, lastHourSummary, runningContraction, toggleContraction } from './logic';

const t = (h: number, m: number, s = 0) => new Date(Date.UTC(2026, 9, 11, h, m, s)).toISOString();
const c = (id: string, start: string, end: string | null, deletedAt: string | null = null): Contraction => ({
  id,
  createdAt: start,
  updatedAt: start,
  deletedAt,
  deviceId: 'd',
  start,
  end,
});

describe('contraction list', () => {
  it('gives durations and the time since the previous start, newest first', () => {
    const rows = contractionRows([c('b', t(10, 6), t(10, 7, 5)), c('a', t(10, 0), t(10, 0, 50)), c('c', t(10, 11, 30), null)]);
    expect(rows).toEqual([
      { id: 'c', start: t(10, 11, 30), durationSec: null, sincePreviousSec: 330 },
      { id: 'b', start: t(10, 6), durationSec: 65, sincePreviousSec: 360 },
      { id: 'a', start: t(10, 0), durationSec: 50, sincePreviousSec: null },
    ]);
  });

  it('leaves out deleted contractions, also when measuring intervals', () => {
    const rows = contractionRows([c('a', t(10, 0), t(10, 1)), c('x', t(10, 5), t(10, 6), t(10, 7)), c('b', t(10, 10), t(10, 11))]);
    expect(rows.map((r) => [r.id, r.sincePreviousSec])).toEqual([
      ['b', 600],
      ['a', null],
    ]);
  });

  it('finds the running contraction', () => {
    expect(runningContraction([c('a', t(10, 0), t(10, 1)), c('b', t(10, 5), null)])?.id).toBe('b');
    expect(runningContraction([c('a', t(10, 0), t(10, 1)), c('b', t(10, 5), null, t(10, 6))])).toBeUndefined();
  });

  it('formats seconds as minutes and seconds', () => {
    expect(formatSeconds(65)).toBe('1:05');
    expect(formatSeconds(720)).toBe('12:00');
    expect(formatSeconds(-3)).toBe('0:00');
    expect(formatSeconds(3600 * 24 + 65)).toBe('24:01:05');
  });
});

describe('last 60 minutes', () => {
  const now = new Date(t(11, 0));

  it('counts, averages durations of finished ones and intervals between starts', () => {
    const list = [
      c('old', t(9, 50), t(9, 51)), // more than an hour ago: left out
      c('a', t(10, 10), t(10, 11)), // 60 s
      c('b', t(10, 20), t(10, 21, 30)), // 90 s
      c('c', t(10, 32), null), // running: counted, no duration
      c('gone', t(10, 25), t(10, 26), t(10, 27)), // deleted
    ];
    expect(lastHourSummary(list, now)).toEqual({ count: 3, avgDurationSec: 75, avgIntervalSec: 660 });
  });

  it('has no averages with too little data', () => {
    expect(lastHourSummary([], now)).toEqual({ count: 0, avgDurationSec: null, avgIntervalSec: null });
    expect(lastHourSummary([c('a', t(10, 30), null)], now)).toEqual({ count: 1, avgDurationSec: null, avgIntervalSec: null });
  });

  it('never averages a negative length (clocks of two phones slightly apart)', () => {
    expect(lastHourSummary([c('a', t(10, 30, 5), t(10, 30, 0)), c('b', t(10, 40), t(10, 41))], now).avgDurationSec).toBe(30);
  });

  it('includes a contraction that started exactly 60 minutes ago', () => {
    expect(lastHourSummary([c('a', t(10, 0), t(10, 1))], now).count).toBe(1);
  });
});

describe('announcing to the other parent', () => {
  it('announces the first contraction, and the first after more than 2 hours', () => {
    const first = c('a', t(8, 0), t(8, 1));
    const soon = c('b', t(8, 10), null);
    const later = c('c', t(10, 30), null);
    expect(isFirstAfterGap(first, [first])).toBe(true);
    expect(isFirstAfterGap(soon, [first, soon])).toBe(false);
    expect(isFirstAfterGap(later, [first, soon, later])).toBe(true);
    // Exactly 2 hours after the previous start is not a gap "of more than 2 hours".
    expect(isFirstAfterGap(c('d', t(10, 10), null), [first, soon, c('d', t(10, 10), null)])).toBe(false);
  });

  it('ignores deleted contractions (after "Clear all" the next one is news again)', () => {
    const cleared = c('a', t(8, 0), t(8, 1), t(8, 30));
    const next = c('b', t(8, 40), null);
    expect(isFirstAfterGap(next, [cleared, next])).toBe(true);
  });
});

describe('the big button', () => {
  let n = 0;
  const phone = async () => openDexieStore({ name: `contractions-${++n}` });

  it('starts and stops, and a double tap changes nothing the second time', async () => {
    const store = await phone();
    const now = new Date(t(10, 0));
    const [a, b] = await Promise.all([toggleContraction(store, 'start', now), toggleContraction(store, 'start', now)]);
    expect([a, b].sort()).toEqual(['none', 'started']);
    expect(await store.contractions.list()).toHaveLength(1);
    const later = new Date(t(10, 1));
    const [c1, c2] = await Promise.all([toggleContraction(store, 'stop', later), toggleContraction(store, 'stop', later)]);
    expect([c1, c2].sort()).toEqual(['none', 'stopped']);
    expect(await store.contractions.list()).toEqual([expect.objectContaining({ end: t(10, 1) })]);
  });

  it('does not start a new one when the other phone stopped it a moment earlier', async () => {
    const store = await phone();
    await toggleContraction(store, 'start', new Date(t(10, 0)));
    await toggleContraction(store, 'stop', new Date(t(10, 1)));
    // This phone still showed Stop.
    expect(await toggleContraction(store, 'stop', new Date(t(10, 1, 2)))).toBe('none');
    expect(await store.contractions.list()).toHaveLength(1);
  });

  it('stops both when two phones each started one', async () => {
    const one = await phone();
    const two = await phone();
    await toggleContraction(one, 'start', new Date(t(10, 0)));
    await toggleContraction(two, 'start', new Date(t(10, 0, 2)));
    await importBackup(one, await exportBackup(two));
    expect((await one.contractions.list()).filter((x) => x.end === null)).toHaveLength(2);
    expect(await toggleContraction(one, 'stop', new Date(t(10, 1)))).toBe('stopped');
    expect((await one.contractions.list()).every((x) => x.end === t(10, 1))).toBe(true);
  });
});
