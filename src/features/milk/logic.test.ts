import { describe, expect, it } from 'vitest';
import type { MilkStashItem, Pump } from '@/data/types';
import { drawFromStash, pumpedPerDay, pumpTotal, stashAge, stashOldestFirst, stashTotals } from './logic';

const meta = { createdAt: '', updatedAt: '', deletedAt: null, deviceId: 'd' };
const item = (id: string, pumpedAt: string, ml: number, over: Partial<MilkStashItem> = {}): MilkStashItem => ({
  ...meta,
  id,
  pumpedAt,
  ml,
  location: 'fridge',
  usedAt: null,
  pumpId: null,
  ...over,
});
const now = new Date('2026-10-11T12:00:00.000Z');

describe('pumping', () => {
  it('adds up the sides, or uses the total when no sides are given', () => {
    expect(pumpTotal(60, 50, null)).toBe(110);
    expect(pumpTotal(60, null, 999)).toBe(60);
    expect(pumpTotal(null, null, 90)).toBe(90);
  });

  it('totals pumped ml per day', () => {
    const pump = (start: string, totalMl: number, deletedAt: string | null = null): Pump => ({
      ...meta,
      deletedAt,
      id: start,
      start,
      minutes: 15,
      leftMl: null,
      rightMl: null,
      totalMl,
      loggedBy: 'p1',
    });
    const days = [
      { from: new Date('2026-10-10T00:00:00.000Z'), to: new Date('2026-10-11T00:00:00.000Z') },
      { from: new Date('2026-10-11T00:00:00.000Z'), to: new Date('2026-10-12T00:00:00.000Z') },
    ];
    const pumps = [pump('2026-10-10T08:00:00.000Z', 80), pump('2026-10-11T08:00:00.000Z', 100), pump('2026-10-11T09:00:00.000Z', 50, 'x')];
    expect(pumpedPerDay(pumps, days)).toEqual([80, 100]);
  });
});

describe('milk stash', () => {
  const stash = [
    item('new', '2026-10-11T06:00:00.000Z', 100),
    item('old', '2026-10-09T06:00:00.000Z', 60),
    item('frozen', '2026-10-05T06:00:00.000Z', 120, { location: 'freezer' }),
    item('used', '2026-10-01T06:00:00.000Z', 90, { usedAt: '2026-10-02T06:00:00.000Z' }),
    item('gone', '2026-10-01T06:00:00.000Z', 90, { deletedAt: 'x' }),
  ];

  it('lists what is left, oldest first, with totals per place', () => {
    expect(stashOldestFirst(stash).map((i) => i.id)).toEqual(['frozen', 'old', 'new']);
    expect(stashTotals(stash)).toEqual({ fridge: 160, freezer: 120 });
  });

  it('draws the oldest milk first and keeps the rest of a partly used container', () => {
    const draw = drawFromStash(stash, 150, now);
    expect(draw).toEqual({
      changes: [
        { id: 'frozen', ml: 120, usedAt: now.toISOString() },
        { id: 'old', ml: 30, usedAt: null },
      ],
      drawn: 150,
      missing: 0,
    });
  });

  it('reports what the stash could not cover', () => {
    expect(drawFromStash([item('a', '2026-10-11T06:00:00.000Z', 40)], 90, now)).toMatchObject({ drawn: 40, missing: 50 });
    expect(drawFromStash([], 90, now)).toEqual({ changes: [], drawn: 0, missing: 90 });
  });

  it('counts the age in days, and days left only against the parents’ own limit', () => {
    const it2 = item('a', '2026-10-08T06:00:00.000Z', 40);
    expect(stashAge(it2, { fridge: null, freezer: null }, now)).toEqual({ days: 3, daysLeft: null });
    expect(stashAge(it2, { fridge: 4, freezer: null }, now)).toEqual({ days: 3, daysLeft: 1 });
    expect(stashAge(it2, { fridge: 2, freezer: null }, now)).toEqual({ days: 3, daysLeft: -1 });
  });
});
