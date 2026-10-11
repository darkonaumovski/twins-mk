import { describe, expect, it } from 'vitest';
import { ageInfo, latestWeight, weeksAndDays, weightChange } from './age';

const born = new Date(2026, 8, 1, 10).toISOString();

describe('age', () => {
  it('shows only the actual age for a baby born at 37+0 or later, or without a gestational age', () => {
    expect(ageInfo({ birthDateTime: born, gestationWeeksAtBirth: 37, gestationDaysAtBirth: 0 }, new Date(2026, 8, 15))).toEqual({
      actualDays: 14,
      correctedDays: null,
    });
    expect(ageInfo({ birthDateTime: born }, new Date(2026, 8, 15))).toEqual({ actualDays: 14, correctedDays: null });
    expect(ageInfo({ birthDateTime: null }, new Date())).toBeNull();
  });

  it('corrects the age of a baby born before 37+0 by the weeks it came early', () => {
    // Born at 34+2 = 240 days, 40 days early.
    const baby = { birthDateTime: born, gestationWeeksAtBirth: 34, gestationDaysAtBirth: 2 };
    expect(ageInfo(baby, new Date(2026, 9, 31))).toEqual({ actualDays: 60, correctedDays: 20 });
    // Before the due date, the corrected age is negative (shown as "before term").
    expect(ageInfo(baby, new Date(2026, 8, 21))).toEqual({ actualDays: 20, correctedDays: -20 });
  });

  it('splits days into weeks and days', () => {
    expect(weeksAndDays(23)).toEqual({ weeks: 3, days: 2 });
    expect(weeksAndDays(-20)).toEqual({ weeks: 2, days: 6 });
  });
});

describe('weight change', () => {
  it('gives the change from birth weight in grams and percent, with no judgement', () => {
    expect(weightChange(2400, 2280)).toEqual({ grams: -120, percent: -5 });
    expect(weightChange(2400, 3000)).toEqual({ grams: 600, percent: 25 });
    expect(weightChange(null, 3000)).toBeNull();
    expect(weightChange(2400, null)).toBeNull();
  });

  it('takes the newest measured weight', () => {
    const points = [
      { at: '2026-09-01T10:00:00.000Z', weightG: 2400, birth: true },
      { at: '2026-09-10T10:00:00.000Z', weightG: 2500, birth: false },
      { at: '2026-09-05T10:00:00.000Z', weightG: 2350, birth: false },
      { at: '2026-09-12T10:00:00.000Z', weightG: null, birth: false },
    ];
    expect(latestWeight(points)).toBe(2500);
    expect(latestWeight([points[0]])).toBeNull();
  });
});
