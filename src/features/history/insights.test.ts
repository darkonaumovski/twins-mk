import { describe, expect, it } from 'vitest';
import type { LogEntry } from '@/data/types';
import { change, insightDay, insightDayOf, insightsWithChange, weekInsights } from './insights';

const NIGHT = { from: '19:00', to: '07:00' };
let n = 0;
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
function entry(e: Partial<LogEntry> & Pick<LogEntry, 'type' | 'data' | 'start'>): LogEntry {
  return {
    id: `e${++n}`,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    deviceId: 'd',
    babyId: 'baby-A',
    end: null,
    groupId: null,
    loggedBy: 'p1',
    ...e,
  } as LogEntry;
}
const sleep = (start: string, end: string | null, babyId = 'baby-A') => entry({ type: 'sleep', data: {}, start, end, babyId });
const bottle = (start: string, ml = 90, babyId = 'baby-A', groupId: string | null = null) =>
  entry({ type: 'feed', data: { method: 'bottle', ml, milk: 'formula' }, start, end: start, babyId, groupId });
const late = new Date(2026, 9, 20, 12);

describe('insight days', () => {
  it('run from the end of the night to the next morning, so a night is never split at midnight', () => {
    const d = insightDay('2026-10-10', NIGHT);
    expect([d.from, d.nightFrom, d.to].map((x) => x?.toISOString())).toEqual([at(10, 7), at(10, 19), at(11, 7)]);
    expect(insightDayOf(new Date(at(11, 3)), NIGHT)).toBe('2026-10-10');
    expect(insightDayOf(new Date(at(11, 7)), NIGHT)).toBe('2026-10-11');
    // A night within the day (00:00–06:00) starts after midnight; equal times mean no night.
    expect(insightDay('2026-10-10', { from: '00:00', to: '06:00' }).nightFrom?.toISOString()).toBe(at(11, 0));
    expect(insightDay('2026-10-10', { from: '07:00', to: '07:00' }).nightFrom).toBeNull();
  });
});

describe('weekly insights', () => {
  it('counts a sleep across midnight toward the night it belongs to', () => {
    const w = weekInsights([sleep(at(10, 22), at(11, 4, 10)), bottle(at(10, 9))], 'baby-A', '2026-10-11', NIGHT, late);
    expect(w.longestSleep).toEqual({ minutes: 370, day: '2026-10-10', night: true });
    // One day with entries (the 10th): the whole sleep is that night's.
    expect(w.days).toBe(1);
    expect(w.sleepPerDay).toEqual({ total: 370, day: 0, night: 370 });
  });

  it('splits sleep into day and night by the family’s night hours', () => {
    const w = weekInsights([sleep(at(11, 13), at(11, 15)), sleep(at(11, 18), at(11, 20))], 'baby-A', '2026-10-11', NIGHT, late);
    expect(w.sleepPerDay).toEqual({ total: 240, day: 180, night: 60 });
    expect(w.longestSleep).toEqual({ minutes: 120, day: '2026-10-11', night: false });
  });

  it('leaves days with no entries out of the averages and says how many days it is based on', () => {
    // Entries on 3 of the 7 days.
    const w = weekInsights(
      [
        bottle(at(5, 9), 100),
        bottle(at(5, 12), 100),
        bottle(at(8, 9), 80),
        bottle(at(11, 9), 60),
        bottle(at(11, 12), 60),
        bottle(at(11, 15), 60),
      ],
      'baby-A',
      '2026-10-11',
      NIGHT,
      late,
    );
    expect(w.days).toBe(3);
    expect(w.feedsPerDay).toBe(2);
    expect(w.mlPerDay).toBe(153);
  });

  it('measures feed gaps between consecutive starts of the same twin, leaving out gaps across a day without feeds', () => {
    const w = weekInsights(
      [
        bottle(at(9, 8)),
        bottle(at(9, 11)), // 180 min
        bottle(at(9, 13, 30)), // 150 min
        bottle(at(9, 10), 90, 'baby-B'), // the other twin: not counted
        // The 10th has no feeds logged: the gap to the 11th is missing data.
        bottle(at(11, 9)),
        bottle(at(11, 12)), // 180 min
      ],
      'baby-A',
      '2026-10-11',
      NIGHT,
      late,
    );
    expect(w.feedGapMin).toBe(170);
  });

  it('counts a tandem ("both twins") feed once per twin', () => {
    const entries = [
      bottle(at(11, 8), 90, 'baby-A', 'g1'),
      bottle(at(11, 8), 90, 'baby-B', 'g1'),
      bottle(at(11, 11), 90, 'baby-A', 'g2'),
      bottle(at(11, 11), 90, 'baby-B', 'g2'),
    ];
    for (const id of ['baby-A', 'baby-B']) {
      const w = weekInsights(entries, id, '2026-10-11', NIGHT, late);
      expect([w.feedsPerDay, w.feedGapMin, w.mlPerDay]).toEqual([2, 180, 180]);
    }
  });

  it('counts a running sleep up to now', () => {
    const now = new Date(2026, 9, 11, 23, 0);
    const w = weekInsights([sleep(at(11, 20), null)], 'baby-A', '2026-10-11', NIGHT, now);
    expect(w.longestSleep).toEqual({ minutes: 180, day: '2026-10-11', night: true });
    expect(w.sleepPerDay).toEqual({ total: 180, day: 0, night: 180 });
  });

  it('gives nothing to average for a twin with no entries (e.g. still in hospital and not logged)', () => {
    expect(weekInsights([bottle(at(11, 9), 90, 'baby-B')], 'baby-A', '2026-10-11', NIGHT, late)).toMatchObject({
      days: 0,
      sleepPerDay: null,
      feedsPerDay: null,
      longestSleep: null,
    });
  });

  it('includes breastfeeding minutes and top-ups, and ignores deleted entries', () => {
    const breast = entry({
      type: 'feed',
      data: { method: 'breast', side: 'left', topUp: { ml: 30, milk: 'breast' } },
      start: at(11, 9),
      end: at(11, 9, 20),
    });
    const gone = { ...bottle(at(11, 10), 500), deletedAt: 'x' };
    const w = weekInsights([breast, gone], 'baby-A', '2026-10-11', NIGHT, late);
    expect([w.feedsPerDay, w.mlPerDay, w.breastMinPerDay]).toEqual([1, 30, 20]);
  });

  it('compares with the week before', () => {
    const entries = [bottle(at(2, 9)), bottle(at(2, 12)), bottle(at(2, 15)), bottle(at(9, 9)), bottle(at(9, 12))];
    const { current, previous } = insightsWithChange(entries, 'baby-A', '2026-10-11', NIGHT, late);
    expect([current.feedsPerDay, previous.feedsPerDay]).toEqual([2, 3]);
    expect(change(current.feedsPerDay, previous.feedsPerDay)).toBe(-1);
    expect(change(current.feedGapMin, null)).toBeNull();
  });
});
