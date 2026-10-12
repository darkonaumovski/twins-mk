import { addDays, format, parseISO } from 'date-fns';
import type { ISODate, LogEntry } from '@/data/types';
import { daysEnding, summarize } from './summary';

const MIN = 60_000;

export interface NightHours {
  from: string;
  to: string;
}

/** The local time `HH:mm` on a calendar day. */
function at(day: ISODate, hhmm: string): Date {
  const d = parseISO(day);
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h || 0, m || 0);
}

/**
 * One "insight day": from the end of the night hours (07:00) to the same time the next morning,
 * so a night's sleep is never cut in two at midnight. Its night part is the night hours inside it.
 */
export function insightDay(day: ISODate, night: NightHours): { from: Date; to: Date; nightFrom: Date | null } {
  const next = format(addDays(parseISO(day), 1), 'yyyy-MM-dd');
  const from = at(day, night.to);
  const to = at(next, night.to);
  // 19:00–07:00: the night starts this evening. 00:00–06:00: it starts after midnight. Equal times: no night.
  const nightFrom = night.from === night.to ? null : night.from > night.to ? at(day, night.from) : at(next, night.from);
  return { from, to, nightFrom };
}

/** The insight day a moment belongs to (03:00 on the 11th belongs to the night of the 10th). */
export function insightDayOf(moment: Date, night: NightHours): ISODate {
  const sameDay = format(moment, 'yyyy-MM-dd');
  return moment < at(sameDay, night.to) ? format(addDays(parseISO(sameDay), -1), 'yyyy-MM-dd') : sameDay;
}

const overlap = (s: number, e: number, from: number, to: number) => Math.max(0, Math.min(e, to) - Math.max(s, from));

export interface WeekInsights {
  /** Days with at least one entry for this twin; the averages are over these days. */
  days: number;
  /** The longest single sleep that started in the week; `night` when it started in the night hours. */
  longestSleep: { minutes: number; day: ISODate; night: boolean } | null;
  /** Average minutes of sleep per day, and its day and night parts. */
  sleepPerDay: { total: number; day: number; night: number } | null;
  /** Average minutes from one feed start to the next. */
  feedGapMin: number | null;
  feedsPerDay: number | null;
  mlPerDay: number | null;
  breastMinPerDay: number | null;
}

/**
 * What one twin's week (the 7 insight days ending on `lastDay`) looked like, in plain numbers.
 * Descriptive only: no targets, ranges or judgement. `entries` must cover the week and the day before.
 */
export function weekInsights(entries: readonly LogEntry[], babyId: string, lastDay: ISODate, night: NightHours, now: Date): WeekInsights {
  const own = entries.filter((e) => e.babyId === babyId && e.deletedAt === null);
  const nowMs = now.getTime();
  const windows = daysEnding(lastDay, 7).map((day) => ({ day, ...insightDay(day, night) }));
  const weekFrom = windows[0].from.getTime();
  const weekTo = Math.min(windows[6].to.getTime(), nowMs);
  const inWindow = (e: LogEntry, w: { from: Date; to: Date }) => {
    const s = new Date(e.start).getTime();
    return s >= w.from.getTime() && s < w.to.getTime();
  };

  // Days with no entries at all are missing data, not "nothing happened".
  const active = windows.filter((w) => own.some((e) => inWindow(e, w)));
  const n = active.length;
  const empty: WeekInsights = {
    days: 0,
    longestSleep: null,
    sleepPerDay: null,
    feedGapMin: null,
    feedsPerDay: null,
    mlPerDay: null,
    breastMinPerDay: null,
  };
  if (n === 0) return empty;

  let feeds = 0;
  let ml = 0;
  let breast = 0;
  let sleepDay = 0;
  let sleepNight = 0;
  for (const w of active) {
    const sum = summarize(own, babyId, w.from, w.to, now);
    feeds += sum.feeds;
    ml += sum.ml;
    breast += sum.breastMinutes;
    const end = Math.min(w.to.getTime(), nowMs);
    const nightFrom = w.nightFrom?.getTime() ?? w.to.getTime();
    for (const e of own) {
      if (e.type !== 'sleep') continue;
      const s = new Date(e.start).getTime();
      const f = e.end === null ? nowMs : new Date(e.end).getTime();
      // Night hours inside the window run from nightFrom to its end; the rest is day.
      sleepNight += overlap(s, f, nightFrom, end);
      sleepDay += overlap(s, f, w.from.getTime(), Math.min(nightFrom, end));
    }
  }

  // Longest single sleep that started in the week (a running one counts up to now).
  let longest: WeekInsights['longestSleep'] = null;
  for (const e of own) {
    if (e.type !== 'sleep') continue;
    const s = new Date(e.start).getTime();
    if (s < weekFrom || s >= weekTo) continue;
    const minutes = Math.round(((e.end === null ? nowMs : new Date(e.end).getTime()) - s) / MIN);
    if (minutes <= 0 || (longest && minutes <= longest.minutes)) continue;
    const day = insightDayOf(new Date(e.start), night);
    const w = insightDay(day, night);
    longest = { minutes, day, night: w.nightFrom !== null && s >= w.nightFrom.getTime() };
  }

  // Gaps between consecutive feed starts of this twin (a tandem feed is one entry per twin).
  // A gap across a whole day with no feeds logged is missing data, so it is left out.
  const starts = own
    .filter((e) => e.type === 'feed' && new Date(e.start).getTime() >= weekFrom && new Date(e.start).getTime() < weekTo)
    .map((e) => new Date(e.start))
    .sort((a, b) => a.getTime() - b.getTime());
  const feedDays = new Set(starts.map((d) => insightDayOf(d, night)));
  const gaps: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const fromDay = insightDayOf(starts[i - 1], night);
    const toDay = insightDayOf(starts[i], night);
    let skipped = false;
    for (let d = addDays(parseISO(fromDay), 1); format(d, 'yyyy-MM-dd') < toDay; d = addDays(d, 1)) {
      if (!feedDays.has(format(d, 'yyyy-MM-dd'))) skipped = true;
    }
    if (!skipped) gaps.push((starts[i].getTime() - starts[i - 1].getTime()) / MIN);
  }

  const avg = (total: number) => total / n;
  return {
    days: n,
    longestSleep: longest,
    sleepPerDay: {
      total: Math.round(avg(sleepDay + sleepNight) / MIN),
      day: Math.round(avg(sleepDay) / MIN),
      night: Math.round(avg(sleepNight) / MIN),
    },
    feedGapMin: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
    feedsPerDay: Math.round(avg(feeds) * 10) / 10,
    mlPerDay: Math.round(avg(ml)),
    breastMinPerDay: Math.round(avg(breast)),
  };
}

/** This week and the week before it, for the change shown next to each value. */
export function insightsWithChange(
  entries: readonly LogEntry[],
  babyId: string,
  lastDay: ISODate,
  night: NightHours,
  now: Date,
): { current: WeekInsights; previous: WeekInsights } {
  const before = format(addDays(parseISO(lastDay), -7), 'yyyy-MM-dd');
  return {
    current: weekInsights(entries, babyId, lastDay, night, now),
    previous: weekInsights(entries, babyId, before, night, now),
  };
}

/** The change from the week before, or null when either week has no value. */
export function change(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  return Math.round((current - previous) * 10) / 10;
}
