import { differenceInCalendarDays } from 'date-fns';
import type { Baby, ISODateTime } from '@/data/types';

/** 40 weeks: the age a baby born at term counts from. */
const TERM_DAYS = 280;
/** Born before 37+0 weeks: the age is also shown corrected for prematurity. */
export const PRETERM_BEFORE_DAYS = 37 * 7;

export interface AgeInfo {
  /** Whole days since birth. */
  actualDays: number;
  /** Days since the due date (term), only for babies born before 37+0; negative before term. */
  correctedDays: number | null;
}

/** Gestational age at birth in days, if the parents entered it. */
export function gestationDays(baby: Pick<Baby, 'gestationWeeksAtBirth' | 'gestationDaysAtBirth'>): number | null {
  const weeks = baby.gestationWeeksAtBirth;
  if (weeks === null || weeks === undefined) return null;
  return weeks * 7 + (baby.gestationDaysAtBirth ?? 0);
}

/** Actual age, plus the corrected age for a baby born before 37+0 weeks. */
export function ageInfo(baby: Pick<Baby, 'birthDateTime' | 'gestationWeeksAtBirth' | 'gestationDaysAtBirth'>, now: Date): AgeInfo | null {
  if (!baby.birthDateTime) return null;
  const actualDays = Math.max(0, differenceInCalendarDays(now, new Date(baby.birthDateTime)));
  const ga = gestationDays(baby);
  const correctedDays = ga !== null && ga < PRETERM_BEFORE_DAYS ? actualDays - (TERM_DAYS - ga) : null;
  return { actualDays, correctedDays };
}

/** Weeks and days, e.g. 23 days → { weeks: 3, days: 2 }. */
export function weeksAndDays(totalDays: number): { weeks: number; days: number } {
  const abs = Math.abs(totalDays);
  return { weeks: Math.floor(abs / 7), days: abs % 7 };
}

export interface WeightChange {
  grams: number;
  /** Percent of the birth weight, one decimal. */
  percent: number;
}

/** Change from the birth weight to the latest weight, as numbers only. */
export function weightChange(birthWeightG: number | null, latestWeightG: number | null): WeightChange | null {
  if (!birthWeightG || latestWeightG === null) return null;
  const grams = latestWeightG - birthWeightG;
  return { grams, percent: Math.round((grams / birthWeightG) * 1000) / 10 };
}

/** The newest weight among measurements, if any (ISO start + grams). */
export function latestWeight(points: readonly { at: ISODateTime; weightG: number | null; birth: boolean }[]): number | null {
  const withWeight = points.filter((p) => !p.birth && p.weightG !== null);
  if (!withWeight.length) return null;
  return [...withWeight].sort((a, b) => b.at.localeCompare(a.at))[0].weightG;
}
