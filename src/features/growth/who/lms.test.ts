import { describe, expect, it, vi } from 'vitest';
import { WHO_TABLES } from './tables';
import {
  ageAxisDays,
  ageDomain,
  agePoints,
  DAYS_PER_MONTH,
  lmsValue,
  PERCENTILE_Z,
  referenceLines,
  tablesIfWanted,
  usesCorrectedAge,
  type WhoMeasure,
  type WhoSex,
} from './lms';

/**
 * Published WHO percentiles (rounded to 0.1 in the tables): measure, sex, month, P3, P50, P97.
 * From the same WHO percentile files as tables.ts (weight in kg, length and head in cm).
 */
const PUBLISHED: [WhoMeasure, WhoSex, number, number, number, number][] = [
  ['weight', 'male', 0, 2.5, 3.3, 4.3],
  ['weight', 'male', 12, 7.8, 9.6, 11.8],
  ['weight', 'female', 0, 2.4, 3.2, 4.2],
  ['weight', 'female', 12, 7.1, 8.9, 11.3],
  ['length', 'male', 0, 46.3, 49.9, 53.4],
  ['length', 'male', 12, 71.3, 75.7, 80.2],
  ['length', 'female', 0, 45.6, 49.1, 52.7],
  ['length', 'female', 12, 69.2, 74, 78.9],
  ['head', 'male', 0, 32.1, 34.5, 36.9],
  ['head', 'male', 12, 43.6, 46.1, 48.5],
  ['head', 'female', 0, 31.7, 33.9, 36.1],
  ['head', 'female', 12, 42.3, 44.9, 47.5],
];

const z = (p: number) => PERCENTILE_Z.find((x) => x.p === p)!.z;
/** The tables print one decimal: the computed value must round to the published one. */
const round1 = (v: number) => Math.round(v * 10) / 10;

describe('WHO LMS curves', () => {
  it.each(PUBLISHED)('%s, %s, month %i: 3rd, 50th and 97th percentile match the published table', (measure, sex, month, p3, p50, p97) => {
    const [, L, M, S] = WHO_TABLES[measure][sex].find(([m]) => m === month)!;
    expect(round1(lmsValue(L, M, S, z(3)))).toBe(p3);
    expect(round1(lmsValue(L, M, S, z(50)))).toBe(p50);
    expect(round1(lmsValue(L, M, S, z(97)))).toBe(p97);
  });

  it('has months 0 to 24 for every measure and sex', () => {
    for (const measure of ['weight', 'length', 'head'] as const)
      for (const sex of ['male', 'female'] as const)
        expect(WHO_TABLES[measure][sex].map(([m]) => m)).toEqual(Array.from({ length: 25 }, (_, i) => i));
  });

  it('uses the exponential form when L is 0', () => {
    expect(lmsValue(0, 10, 0.1, 1)).toBeCloseTo(10 * Math.exp(0.1), 10);
    expect(lmsValue(1, 50, 0.04, 0)).toBe(50);
  });

  it("draws five lines in the app's units (grams for weight), one point per month, reaching past each edge", () => {
    const lines = referenceLines(WHO_TABLES, 'weight', 'female', 0, 100);
    expect(lines.map((l) => l.p)).toEqual([3, 15, 50, 85, 97]);
    expect(lines[2].points.map((p) => Math.round(p.t / DAYS_PER_MONTH))).toEqual([0, 1, 2, 3, 4]);
    expect(lines[2].points[0].v).toBeCloseTo(3232.2, 1);
  });

  it('gives no lines outside 0–24 months', () => {
    expect(referenceLines(WHO_TABLES, 'head', 'male', 900, 1000)).toEqual([]);
  });
});

describe('age axis', () => {
  const born = '2026-01-01T10:00:00.000Z';

  it('is days since birth for a twin born at term', () => {
    const baby = { birthDateTime: born, gestationWeeksAtBirth: 38, gestationDaysAtBirth: 2 };
    expect(ageAxisDays(baby, '2026-01-31T10:00:00.000Z')).toBe(30);
    expect(usesCorrectedAge(baby)).toBe(false);
  });

  it('is corrected age for a twin born at 35+4 (31 days before the due date)', () => {
    const baby = { birthDateTime: born, gestationWeeksAtBirth: 35, gestationDaysAtBirth: 4 };
    expect(usesCorrectedAge(baby)).toBe(true);
    expect(ageAxisDays(baby, born)).toBe(-31);
    expect(ageAxisDays(baby, '2026-01-31T10:00:00.000Z')).toBe(-1);
    expect(ageAxisDays(baby, '2026-03-03T10:00:00.000Z')).toBe(30);
  });

  it('places measurements of a twin born at 35+4 on the corrected-age axis, starting before 0', () => {
    const baby = { birthDateTime: born, gestationWeeksAtBirth: 35, gestationDaysAtBirth: 4 };
    const pts = agePoints(baby, [
      { at: born, value: 2400 },
      { at: '2026-01-21T10:00:00.000Z', value: null },
      { at: '2026-03-03T10:00:00.000Z', value: 3900 },
    ]);
    expect(pts).toEqual([
      { t: -31, v: 2400 },
      { t: 30, v: 3900 },
    ]);
    expect(ageDomain(pts.map((p) => p.t))).toEqual([-31, 30]);
  });

  it('shows at least one month from birth', () => {
    expect(ageDomain([3, 10])).toEqual([0, DAYS_PER_MONTH]);
    expect(ageDomain([20, 400])).toEqual([0, 400]);
  });

  it('is days since birth when the weeks of pregnancy were not entered, and nothing without a birth time', () => {
    expect(ageAxisDays({ birthDateTime: born }, '2026-01-11T10:00:00.000Z')).toBe(10);
    expect(ageAxisDays({ birthDateTime: null }, '2026-01-11T10:00:00.000Z')).toBeNull();
  });
});

describe('loading the tables', () => {
  it('never loads them while the switch is off', async () => {
    const load = vi.fn(async () => WHO_TABLES);
    expect(await tablesIfWanted(false, 'female', load)).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('does not load them for a twin without sex set (the page asks to set it instead)', async () => {
    const load = vi.fn(async () => WHO_TABLES);
    expect(await tablesIfWanted(true, null, load)).toBeNull();
    expect(await tablesIfWanted(true, undefined, load)).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('loads them once wanted', async () => {
    const load = vi.fn(async () => WHO_TABLES);
    expect(await tablesIfWanted(true, 'male', load)).toBe(WHO_TABLES);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('curves for a twin born early', () => {
  it('start at 0 when the view begins before the due date', () => {
    const lines = referenceLines(WHO_TABLES, 'head', 'female', -31, 30);
    expect(lines).toHaveLength(5);
    expect(lines[0].points[0].t).toBe(0);
    expect(lines[0].points.length).toBe(2);
  });
});
