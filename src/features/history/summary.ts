import { addDays, format, parseISO } from 'date-fns';
import type { Baby, ISODate, LogEntry } from '@/data/types';

export interface DaySummary {
  feeds: number;
  bottleFeeds: number;
  breastFeeds: number;
  /** Total bottle volume. */
  ml: number;
  breastMinutes: number;
  diapers: number;
  wet: number;
  dirty: number;
  /** Minutes asleep within the day; sleeps crossing midnight are split between the days. */
  sleepMinutes: number;
  meds: number;
}

export const EMPTY_SUMMARY: DaySummary = {
  feeds: 0,
  bottleFeeds: 0,
  breastFeeds: 0,
  ml: 0,
  breastMinutes: 0,
  diapers: 0,
  wet: 0,
  dirty: 0,
  sleepMinutes: 0,
  meds: 0,
};

/** Minutes of [start, end) that fall inside [from, to). A running entry counts up to `now`. */
function overlapMinutes(start: string, end: string | null, from: Date, to: Date, now: Date): number {
  const s = Math.max(new Date(start).getTime(), from.getTime());
  const e = Math.min(new Date(end ?? now).getTime(), to.getTime(), now.getTime());
  return e > s ? (e - s) / 60_000 : 0;
}

/**
 * Totals for one baby over one local day [from, to). Events count on the day they
 * start; sleep and breastfeeding time is clipped to the day.
 * `entries` may include entries from neighbouring days (needed for sleeps that cross midnight).
 */
export function summarize(entries: readonly LogEntry[], babyId: string, from: Date, to: Date, now: Date): DaySummary {
  const sum = { ...EMPTY_SUMMARY };
  for (const e of entries) {
    if (e.babyId !== babyId || e.deletedAt !== null) continue;
    const startsToday = e.start >= from.toISOString() && e.start < to.toISOString();
    switch (e.type) {
      case 'feed':
        if (e.data.method === 'breast') {
          sum.breastMinutes += overlapMinutes(e.start, e.end, from, to, now);
          if (startsToday) sum.breastFeeds++;
        } else if (startsToday) {
          sum.bottleFeeds++;
          sum.ml += e.data.ml;
        }
        if (startsToday) sum.feeds++;
        break;
      case 'diaper':
        if (!startsToday) break;
        sum.diapers++;
        if (e.data.kind !== 'dirty') sum.wet++;
        if (e.data.kind !== 'wet') sum.dirty++;
        break;
      case 'sleep':
        sum.sleepMinutes += overlapMinutes(e.start, e.end, from, to, now);
        break;
      case 'med':
        if (startsToday) sum.meds++;
        break;
    }
  }
  sum.sleepMinutes = Math.round(sum.sleepMinutes);
  sum.breastMinutes = Math.round(sum.breastMinutes);
  return sum;
}

export function localDay(date: ISODate): { from: Date; to: Date } {
  const from = parseISO(date);
  return { from, to: addDays(from, 1) };
}

/** The `count` calendar days ending with `lastDay`, oldest first. */
export function daysEnding(lastDay: ISODate, count: number): ISODate[] {
  const last = parseISO(lastDay);
  return Array.from({ length: count }, (_, i) => format(addDays(last, i - count + 1), 'yyyy-MM-dd'));
}

export interface GrowthPoint {
  at: string;
  weightG: number | null;
  lengthCm: number | null;
  /** True for the birth measurement taken from the twin's setup. */
  birth: boolean;
}

/** Birth values plus every measurement entry, oldest first. */
export function growthPoints(baby: Baby | undefined, entries: readonly LogEntry[]): GrowthPoint[] {
  const points: GrowthPoint[] = [];
  if (baby?.birthDateTime && (baby.birthWeightG !== null || baby.birthLengthCm !== null)) {
    points.push({ at: baby.birthDateTime, weightG: baby.birthWeightG, lengthCm: baby.birthLengthCm, birth: true });
  }
  for (const e of entries) {
    if (e.type !== 'measure' || e.deletedAt !== null || e.babyId !== baby?.id) continue;
    points.push({ at: e.start, weightG: e.data.weightG, lengthCm: e.data.lengthCm, birth: false });
  }
  return points.sort((a, b) => a.at.localeCompare(b.at));
}
