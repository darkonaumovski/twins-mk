import type { Baby, ISODateTime } from '@/data/types';
import { gestationDays, PRETERM_BEFORE_DAYS } from '@/features/twins/age';

export type WhoMeasure = 'weight' | 'length' | 'head';
export type WhoSex = 'male' | 'female';
/** One row of a WHO table: completed month, L, M, S. */
export type LmsRow = readonly [month: number, L: number, M: number, S: number];
export type WhoTables = Record<WhoMeasure, Record<WhoSex, readonly LmsRow[]>>;

/** WHO's average month length, used to turn days of age into months. */
export const DAYS_PER_MONTH = 30.4375;
/** 40 weeks: the corrected age of a baby born early counts from here. */
const TERM_DAYS = 280;

/** The reference lines drawn: the 3rd, 15th, 50th, 85th and 97th percentiles, as z-scores. */
export const PERCENTILE_Z: readonly { p: number; z: number }[] = [
  { p: 3, z: -1.880794 },
  { p: 15, z: -1.036433 },
  { p: 50, z: 0 },
  { p: 85, z: 1.036433 },
  { p: 97, z: 1.880794 },
];

/** The LMS formula: the measurement at z-score `z`. X = M · (1 + L·S·Z)^(1/L), and M · e^(S·Z) when L is 0. */
export function lmsValue(L: number, M: number, S: number, z: number): number {
  if (L === 0) return M * Math.exp(S * z);
  return M * Math.pow(1 + L * S * z, 1 / L);
}

/**
 * Days on the chart's age axis for a moment in a twin's life: days since birth, or for a twin born
 * before 37+0 the days since the due date (corrected age, negative before it). Null without a birth time.
 */
export function ageAxisDays(
  baby: Pick<Baby, 'birthDateTime' | 'gestationWeeksAtBirth' | 'gestationDaysAtBirth'>,
  at: ISODateTime,
): number | null {
  if (!baby.birthDateTime) return null;
  const days = (Date.parse(at) - Date.parse(baby.birthDateTime)) / 86_400_000;
  const ga = gestationDays(baby);
  return ga !== null && ga < PRETERM_BEFORE_DAYS ? days - (TERM_DAYS - ga) : days;
}

/** Whether the age axis is corrected age (twin born before 37+0). */
export function usesCorrectedAge(baby: Pick<Baby, 'gestationWeeksAtBirth' | 'gestationDaysAtBirth'>): boolean {
  const ga = gestationDays(baby);
  return ga !== null && ga < PRETERM_BEFORE_DAYS;
}

/** A twin's measurements on the age axis (days, corrected when born early), skipping missing values. */
export function agePoints(
  baby: Pick<Baby, 'birthDateTime' | 'gestationWeeksAtBirth' | 'gestationDaysAtBirth'>,
  points: readonly { at: ISODateTime; value: number | null }[],
): { t: number; v: number }[] {
  return points.flatMap(({ at, value }) => {
    const t = ageAxisDays(baby, at);
    return t === null || value === null ? [] : [{ t, v: value }];
  });
}

/**
 * The age range to show: from the earlier of birth (0) and the first measurement (a twin born early
 * can be measured before its due date) to the last one, at least a month wide.
 */
export function ageDomain(ts: readonly number[]): [number, number] {
  const from = Math.min(0, ...ts);
  const to = Math.max(from + DAYS_PER_MONTH, ...ts);
  return [from, to];
}

/** The measure in the app's unit (grams for weight, cm otherwise) at the given z-score and month row. */
const inAppUnit = (measure: WhoMeasure, kgOrCm: number) => (measure === 'weight' ? kgOrCm * 1000 : kgOrCm);

export interface ReferenceLine {
  /** Percentile, e.g. 50. */
  p: number;
  /** Age in days (x) and value in the app's unit (y), one point per month. */
  points: { t: number; v: number }[];
}

/**
 * The five reference lines for one measure and sex, one point per month from `fromDay` to `toDay`
 * (days of age, clamped to the table's 0–24 months). Empty when the range lies outside it.
 */
export function referenceLines(tables: WhoTables, measure: WhoMeasure, sex: WhoSex, fromDay: number, toDay: number): ReferenceLine[] {
  const rows = tables[measure][sex].filter(([month]) => {
    const day = month * DAYS_PER_MONTH;
    // One month either side, so the lines reach the edges of the chart.
    return day >= fromDay - DAYS_PER_MONTH && day <= toDay + DAYS_PER_MONTH;
  });
  if (rows.length < 2) return [];
  return PERCENTILE_Z.map(({ p, z }) => ({
    p,
    points: rows.map(([month, L, M, S]) => ({ t: month * DAYS_PER_MONTH, v: inAppUnit(measure, lmsValue(L, M, S, z)) })),
  }));
}

/**
 * The tables, but only when they are wanted: the toggle is on and the twin's sex is set. The
 * loader (a dynamic import) is never called otherwise, so the data stays out of the phone's memory.
 */
export async function tablesIfWanted(
  enabled: boolean,
  sex: WhoSex | null | undefined,
  load: () => Promise<WhoTables>,
): Promise<WhoTables | null> {
  if (!enabled || !sex) return null;
  return load();
}
