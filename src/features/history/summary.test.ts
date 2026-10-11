import { describe, expect, it } from 'vitest';
import type { Baby, LogEntry } from '@/data/types';
import { daysEnding, growthPoints, localDay, summarize } from './summary';

let n = 0;
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
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

const { from, to } = localDay('2026-10-11');
const late = new Date(2026, 9, 12, 12);

describe('summarize', () => {
  it('adds top-up bottles after breastfeeds to the ml total', () => {
    const s = summarize(
      [
        entry({ type: 'feed', data: { method: 'breast', side: 'left', topUp: { ml: 30, milk: 'formula' } }, end: at(11, 10, 15) }),
        entry({ type: 'feed', data: { method: 'bottle', ml: 60, milk: 'breast' } }),
      ],
      'baby-A',
      from,
      to,
      late,
    );
    expect(s).toMatchObject({ feeds: 2, breastFeeds: 1, bottleFeeds: 1, ml: 90 });
  });

  it('counts feeds, bottle volume and diapers for one baby', () => {
    const s = summarize(
      [
        entry({ type: 'feed', data: { method: 'bottle', ml: 90, milk: 'formula' } }),
        entry({ type: 'feed', data: { method: 'bottle', ml: 60, milk: 'breast' } }),
        entry({ type: 'feed', data: { method: 'breast', side: 'left' }, start: at(11, 12), end: at(11, 12, 20) }),
        entry({ type: 'diaper', data: { kind: 'wet' } }),
        entry({ type: 'diaper', data: { kind: 'both' } }),
        entry({ type: 'diaper', data: { kind: 'dirty' }, babyId: 'baby-B' }),
        entry({ type: 'med', data: { name: 'D', dose: '' } }),
      ],
      'baby-A',
      from,
      to,
      late,
    );
    expect(s).toMatchObject({
      feeds: 3,
      bottleFeeds: 2,
      breastFeeds: 1,
      ml: 150,
      breastMinutes: 20,
      diapers: 2,
      wet: 2,
      dirty: 1,
      meds: 1,
    });
  });

  it('splits a sleep across midnight between the two days', () => {
    const night = [entry({ type: 'sleep', data: {}, start: at(11, 23), end: at(12, 2) })];
    expect(summarize(night, 'baby-A', from, to, late).sleepMinutes).toBe(60);
    const next = localDay('2026-10-12');
    expect(summarize(night, 'baby-A', next.from, next.to, late).sleepMinutes).toBe(120);
  });

  it('counts a running sleep up to now', () => {
    const now = new Date(2026, 9, 11, 14, 30);
    expect(summarize([entry({ type: 'sleep', data: {}, start: at(11, 14) })], 'baby-A', from, to, now).sleepMinutes).toBe(30);
  });

  it('ignores entries from other days and deleted entries', () => {
    const s = summarize(
      [
        entry({ type: 'diaper', data: { kind: 'wet' }, start: at(10, 23) }),
        entry({ type: 'diaper', data: { kind: 'wet' }, deletedAt: 'x' }),
        entry({ type: 'feed', data: { method: 'bottle', ml: 90, milk: 'formula' }, start: at(12, 0) }),
      ],
      'baby-A',
      from,
      to,
      late,
    );
    expect(s.diapers).toBe(0);
    expect(s.feeds).toBe(0);
  });
});

describe('daysEnding', () => {
  it('lists days oldest first', () => {
    expect(daysEnding('2026-10-02', 3)).toEqual(['2026-09-30', '2026-10-01', '2026-10-02']);
  });
});

describe('growthPoints', () => {
  const baby = { id: 'baby-A', birthDateTime: at(1, 8), birthWeightG: 2450, birthLengthCm: 46 } as Baby;

  it('starts with the birth values and adds measurements in date order', () => {
    const points = growthPoints(baby, [
      entry({ type: 'measure', data: { weightG: 2700, lengthCm: null }, start: at(9, 9) }),
      entry({ type: 'measure', data: { weightG: 2500, lengthCm: 47 }, start: at(5, 9) }),
      entry({ type: 'measure', data: { weightG: 9999, lengthCm: null }, babyId: 'baby-B' }),
      entry({ type: 'note', data: { text: 'x' } }),
    ]);
    expect(points.map((p) => [p.weightG, p.birth])).toEqual([
      [2450, true],
      [2500, false],
      [2700, false],
    ]);
  });

  it('skips the birth point when no birth measurements were entered', () => {
    expect(growthPoints({ ...baby, birthWeightG: null, birthLengthCm: null }, [])).toEqual([]);
  });
});
