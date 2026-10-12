import type { DataStore } from '@/data/repository';
import type { Contraction, ISODateTime } from '@/data/types';

const SEC = 1000;
const HOUR = 3600 * SEC;
/** A contraction after a pause longer than this is announced to the other parent. */
export const ANNOUNCE_GAP_MS = 2 * HOUR;

const live = (list: readonly Contraction[]) => list.filter((c) => c.deletedAt === null);
const ms = (iso: ISODateTime) => new Date(iso).getTime();

export interface ContractionRow {
  id: string;
  start: ISODateTime;
  /** Seconds it lasted; null while it lasts. */
  durationSec: number | null;
  /** Seconds since the previous contraction started; null for the first one. */
  sincePreviousSec: number | null;
}

/** Live contractions, newest first, with their duration and the time since the previous start. */
export function contractionRows(list: readonly Contraction[]): ContractionRow[] {
  const sorted = live(list).sort((a, b) => a.start.localeCompare(b.start));
  return sorted
    .map((c, i) => ({
      id: c.id,
      start: c.start,
      durationSec: c.end === null ? null : Math.max(0, Math.round((ms(c.end) - ms(c.start)) / SEC)),
      sincePreviousSec: i === 0 ? null : Math.round((ms(c.start) - ms(sorted[i - 1].start)) / SEC),
    }))
    .reverse();
}

/** The contraction that is going on now, if any. */
export function runningContraction(list: readonly Contraction[]): Contraction | undefined {
  return live(list)
    .filter((c) => c.end === null)
    .sort((a, b) => b.start.localeCompare(a.start))[0];
}

export interface HourSummary {
  /** Contractions that started in the last 60 minutes. */
  count: number;
  /** Average length of the finished ones, in seconds; null if none finished. */
  avgDurationSec: number | null;
  /** Average time between consecutive starts in the window, in seconds; null with fewer than two. */
  avgIntervalSec: number | null;
}

/** Count, average length and average interval of the contractions that started in the last 60 minutes. */
export function lastHourSummary(list: readonly Contraction[], now: Date): HourSummary {
  const from = now.getTime() - HOUR;
  const inHour = live(list)
    .filter((c) => ms(c.start) >= from && ms(c.start) <= now.getTime())
    .sort((a, b) => a.start.localeCompare(b.start));
  const finished = inHour.filter((c) => c.end !== null);
  const avg = (values: number[]) => (values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null);
  return {
    count: inHour.length,
    avgDurationSec: avg(finished.map((c) => Math.max(0, (ms(c.end!) - ms(c.start)) / SEC))),
    avgIntervalSec: avg(inHour.slice(1).map((c, i) => (ms(c.start) - ms(inHour[i].start)) / SEC)),
  };
}

/**
 * True if this contraction is the first after a pause of more than 2 hours (or the first ever):
 * that one is worth telling the other parent; the ones that follow are not.
 */
export function isFirstAfterGap(c: Contraction, all: readonly Contraction[]): boolean {
  const start = ms(c.start);
  return !live(all).some((o) => o.id !== c.id && ms(o.start) < start && start - ms(o.start) <= ANNOUNCE_GAP_MS);
}

/** "1:05" for 65 seconds, "12:00" for 720, "2:05:00" from an hour on. */
export function formatSeconds(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const pad = (n: number) => String(n).padStart(2, '0');
  if (s >= 3600) return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/**
 * The big button, for what the screen showed (`intent`): Stop ends every contraction that is running
 * (two phones may each have started one); Start begins one. Decided from the stored list inside one
 * transaction: if the other phone (or a double tap) already did it, nothing changes ('none').
 */
export async function toggleContraction(store: DataStore, intent: 'start' | 'stop', now: Date): Promise<'started' | 'stopped' | 'none'> {
  return store.transaction(async () => {
    const running = (await store.contractions.list()).filter((c) => c.end === null);
    const at = now.toISOString();
    if (intent === 'stop') {
      if (!running.length) return 'none';
      await Promise.all(running.map((c) => store.contractions.update(c.id, { end: at })));
      return 'stopped';
    }
    if (running.length) return 'none';
    await store.contractions.create({ start: at, end: null });
    return 'started';
  });
}
