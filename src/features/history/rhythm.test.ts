// Daylight-saving days need a zone that has them (CI runs in UTC). Node applies a TZ change at once in a
// forked test process (vite.config.ts sets pool: 'forks'); the guard below fails loudly if it did not.
process.env.TZ = 'Europe/Skopje';

import { describe, expect, it } from 'vitest';
import type { LogEntry } from '@/data/types';
import { buildRows, inStep, minuteOfDay, nightBands, rhythmDay, sleptMinutes, type RhythmDay } from './rhythm';

let n = 0;
const at = (d: number, h: number, m = 0, month = 9) => new Date(2026, month, d, h, m).toISOString();
function entry(e: Partial<LogEntry> & Pick<LogEntry, 'type' | 'data'>): LogEntry {
  return {
    id: `e${++n}`,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    deviceId: 'd',
    babyId: 'baby-A',
    start: at(11, 10),
    end: null,
    groupId: null,
    loggedBy: 'p1',
    ...e,
  } as LogEntry;
}
const sleep = (start: string, end: string | null, babyId = 'baby-A') => entry({ type: 'sleep', data: {}, start, end, babyId });
const feed = (start: string, babyId = 'baby-A', groupId: string | null = null) =>
  entry({ type: 'feed', data: { method: 'bottle', ml: 90, milk: 'formula' }, start, end: start, babyId, groupId });

const late = new Date(2026, 10, 1, 12);
const day = (sleeps: [number, number][], feeds: number[] = []): RhythmDay => ({
  day: '2026-10-11',
  length: 1440,
  sleeps: sleeps.map(([from, to]) => ({ from, to, running: false })),
  feeds: feeds.map((a) => ({ at: a, linked: false, groupId: null })),
});

it('runs in a time zone with daylight saving', () => {
  expect(new Date(2026, 9, 25, 12).getTimezoneOffset()).toBe(-60);
  expect(new Date(2026, 9, 24, 12).getTimezoneOffset()).toBe(-120);
});

describe('rhythmDay', () => {
  it('splits a sleep across midnight between the two days', () => {
    const entries = [sleep(at(10, 22), at(11, 6))];
    expect(rhythmDay(entries, 'baby-A', '2026-10-10', late).sleeps).toEqual([{ from: 22 * 60, to: 1440, running: false }]);
    expect(rhythmDay(entries, 'baby-A', '2026-10-11', late).sleeps).toEqual([{ from: 0, to: 6 * 60, running: false }]);
  });

  it('extends a running sleep to now, and marks it running', () => {
    const now = new Date(2026, 9, 11, 14, 30);
    const r = rhythmDay([sleep(at(11, 13), null)], 'baby-A', '2026-10-11', now);
    expect(r.sleeps).toEqual([{ from: 13 * 60, to: 14 * 60 + 30, running: true }]);
    // A day before the timer started shows nothing; the day it started yesterday shows up to midnight.
    const overnight = rhythmDay([sleep(at(10, 23), null)], 'baby-A', '2026-10-10', now);
    expect(overnight.sleeps).toEqual([{ from: 23 * 60, to: 1440, running: false }]);
  });

  it('keeps only the twin asked for, live entries and feeds that start on the day', () => {
    const deleted = { ...feed(at(11, 9)), deletedAt: at(11, 9, 5) };
    const r = rhythmDay(
      [feed(at(11, 8)), feed(at(11, 9), 'baby-B'), deleted, feed(at(10, 23, 50)), feed(at(12, 0)), feed(at(11, 7, 30), 'baby-A', 'g1')],
      'baby-A',
      '2026-10-11',
      late,
    );
    expect(r.feeds).toEqual([
      { at: 7 * 60 + 30, linked: false, groupId: 'g1' },
      { at: 8 * 60, linked: false, groupId: null },
    ]);
  });

  it('places feeds on whole minutes, as the clock shows them', () => {
    const a = rhythmDay([feed(new Date(2026, 9, 11, 9, 0, 10).toISOString())], 'baby-A', '2026-10-11', late);
    const b = rhythmDay([feed(new Date(2026, 9, 11, 9, 20, 40).toISOString(), 'baby-B')], 'baby-B', '2026-10-11', late);
    expect(a.feeds[0].at).toBe(9 * 60);
    // 09:00 and 09:20 on screen: exactly the 20-minute window, so together.
    expect(inStep(a, b, 20).feedsTogether).toBe(1);
  });

  it('never draws sleep past now, and drops a sleep that ends before it starts', () => {
    const now = new Date(2026, 9, 11, 14, 0);
    expect(rhythmDay([sleep(at(11, 13), at(11, 16))], 'baby-A', '2026-10-11', now).sleeps).toEqual([
      { from: 780, to: 840, running: false },
    ]);
    expect(rhythmDay([sleep(at(11, 13), at(11, 12))], 'baby-A', '2026-10-11', late).sleeps).toEqual([]);
  });

  it('shows a twin in hospital like any other (no special casing) and an empty day as empty', () => {
    expect(rhythmDay([], 'baby-B', '2026-10-11', late)).toEqual({ day: '2026-10-11', length: 1440, sleeps: [], feeds: [] });
    const r = rhythmDay([sleep(at(11, 1), at(11, 3), 'baby-B')], 'baby-B', '2026-10-11', late);
    expect(r.sleeps).toHaveLength(1);
  });

  it('measures daylight-saving days in real minutes (23 and 25 hours)', () => {
    // Clocks go back on 25 Oct 2026 at 03:00 and forward on 29 Mar 2026 at 02:00 in Skopje.
    const autumn = rhythmDay([sleep(at(25, 1), at(25, 5))], 'baby-A', '2026-10-25', late);
    expect(autumn.length).toBe(25 * 60);
    expect(autumn.sleeps).toEqual([{ from: 60, to: 6 * 60, running: false }]);
    expect(rhythmDay([], 'baby-A', '2026-03-29', late).length).toBe(23 * 60);
    expect(minuteOfDay('2026-10-25', '06:00')).toBe(7 * 60);
    expect(minuteOfDay('2026-03-29', '06:00')).toBe(5 * 60);
  });
});

describe('inStep', () => {
  it('counts the minutes both twins slept at the same time', () => {
    expect(inStep(day([[60, 180]]), day([[120, 240]]), 20).sharedSleepMin).toBe(60);
    expect(inStep(day([[0, 60]]), day([[60, 120]]), 20).sharedSleepMin).toBe(0);
  });

  it('does not count overlapping sleeps of one twin twice', () => {
    const a = day([
      [60, 180],
      [120, 200],
    ]);
    expect(inStep(a, day([[0, 1440]]), 20).sharedSleepMin).toBe(140);
  });

  it('matches feeds one to one within the window', () => {
    // Three A feeds against one B feed: one pair.
    expect(inStep(day([], [100, 105, 110]), day([], [104]), 20)).toMatchObject({ feedsTogether: 1, feedsA: 3, feedsB: 1 });
    // Exactly on the window counts, one minute more does not.
    expect(inStep(day([], [100]), day([], [120]), 20).feedsTogether).toBe(1);
    expect(inStep(day([], [100]), day([], [121]), 20).feedsTogether).toBe(0);
    // Greedy in time order still finds both pairs.
    expect(inStep(day([], [100, 130]), day([], [115, 145]), 20).feedsTogether).toBe(2);
  });

  it('handles empty days', () => {
    expect(inStep(day([]), day([]), 20)).toEqual({ sharedSleepMin: 0, feedsTogether: 0, feedsA: 0, feedsB: 0 });
  });

  it('links a "both twins" feed only while both halves are there', () => {
    const both = [feed(at(11, 9), 'baby-A', 'g'), feed(at(11, 9), 'baby-B', 'g')];
    const [row] = buildRows(both, ['2026-10-11'], late, 20);
    expect([row.twins.A.feeds[0].linked, row.twins.B.feeds[0].linked]).toEqual([true, true]);
    const [half] = buildRows([both[0], { ...both[1], deletedAt: at(11, 10) }], ['2026-10-11'], late, 20);
    expect(half.twins.A.feeds[0].linked).toBe(false);
  });

  it('counts a tandem feed and a shared nap end to end from the logs', () => {
    const entries = [
      feed(at(11, 9), 'baby-A', 'g'),
      feed(at(11, 9), 'baby-B', 'g'),
      sleep(at(10, 23), at(11, 2), 'baby-A'),
      sleep(at(11, 0, 30), at(11, 4), 'baby-B'),
    ];
    const a = rhythmDay(entries, 'baby-A', '2026-10-11', late);
    const b = rhythmDay(entries, 'baby-B', '2026-10-11', late);
    expect(inStep(a, b, 20)).toEqual({ sharedSleepMin: 90, feedsTogether: 1, feedsA: 1, feedsB: 1 });
  });
});

describe('nightBands', () => {
  it('shades the evening and the early morning for a night across midnight', () => {
    expect(nightBands('2026-10-11', { from: '19:00', to: '07:00' }, 1440)).toEqual([
      [0, 420],
      [1140, 1440],
    ]);
  });

  it('shades one band for a night within the day, and none for equal times', () => {
    expect(nightBands('2026-10-11', { from: '00:00', to: '06:00' }, 1440)).toEqual([[0, 360]]);
    expect(nightBands('2026-10-11', { from: '07:00', to: '07:00' }, 1440)).toEqual([]);
  });

  it('follows the clock on a daylight-saving day', () => {
    expect(nightBands('2026-10-25', { from: '19:00', to: '07:00' }, 1500)).toEqual([
      [0, 480],
      [1200, 1500],
    ]);
  });
});

describe('sleptMinutes', () => {
  it('adds up the sleep of the day, overlaps once', () => {
    expect(
      sleptMinutes(
        day([
          [0, 60],
          [30, 90],
          [600, 630],
        ]),
      ),
    ).toBe(120);
  });
});
