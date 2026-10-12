import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import type { ISODate, LogEntry } from '@/data/types';
import { daysEnding, summarize } from './summary';

const MIN = 60_000;
const DAY_MS = 24 * 3600_000;

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
  /** Finished days with at least one entry for this twin; the per-day averages are over these days. */
  days: number;
  /** The longest single sleep that started in the week; `night` when most of it fell in the night hours. */
  longestSleep: { minutes: number; day: ISODate; night: boolean } | null;
  /** Average minutes of sleep per day, and its day and night parts; null when no sleep was logged. */
  sleepPerDay: { total: number; day: number; night: number } | null;
  /** Average minutes from one feed start to the next. */
  feedGapMin: number | null;
  /** Per-day feed averages; null when no feed was logged (missing data, not "none"). */
  feedsPerDay: number | null;
  mlPerDay: number | null;
  breastMinPerDay: number | null;
  /** The week includes today, which is left out of the averages until it is over. */
  todayLeftOut: boolean;
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
  const startOf = (e: LogEntry) => new Date(e.start).getTime();
  const endOf = (e: LogEntry) => (e.end === null ? nowMs : new Date(e.end).getTime());
  const timed = (e: LogEntry) => e.type === 'sleep' || (e.type === 'feed' && e.data.method === 'breast');
  // A day has entries if one starts in it, or a sleep or breastfeed from before runs into it.
  const touches = (e: LogEntry, w: { from: Date; to: Date }) => {
    const s = startOf(e);
    if (s >= w.from.getTime() && s < w.to.getTime()) return true;
    return timed(e) && s < w.from.getTime() && endOf(e) > w.from.getTime();
  };

  // Only finished days go into the averages: today is still filling up, and would pull them down
  // every morning. Days with no entries at all are missing data, not "nothing happened".
  const finished = windows.filter((w) => w.to.getTime() <= nowMs);
  const active = finished.filter((w) => own.some((e) => touches(e, w)));
  const n = active.length;

  let feeds = 0;
  let ml = 0;
  let breast = 0;
  let sleepDay = 0;
  let sleepNight = 0;
  let sawSleep = false;
  for (const w of active) {
    const sum = summarize(own, babyId, w.from, w.to, now);
    feeds += sum.feeds;
    ml += sum.ml;
    breast += sum.breastMinutes;
    const nightFrom = w.nightFrom?.getTime() ?? w.to.getTime();
    for (const e of own) {
      if (e.type !== 'sleep') continue;
      const s = startOf(e);
      const f = endOf(e);
      // Night hours inside the window run from nightFrom to its end; the rest is day.
      const inNight = overlap(s, f, nightFrom, w.to.getTime());
      const inDay = overlap(s, f, w.from.getTime(), nightFrom);
      if (inNight + inDay > 0) sawSleep = true;
      sleepNight += inNight;
      sleepDay += inDay;
    }
  }

  // Longest single sleep that started in the week (a running one counts up to now).
  let longest: WeekInsights['longestSleep'] = null;
  for (const e of own) {
    if (e.type !== 'sleep') continue;
    const s = startOf(e);
    if (s < weekFrom || s >= weekTo) continue;
    const f = endOf(e);
    const minutes = Math.round((f - s) / MIN);
    if (minutes <= 0 || (longest && minutes <= longest.minutes)) continue;
    const day = insightDayOf(new Date(e.start), night);
    const w = insightDay(day, night);
    const inNight = w.nightFrom ? overlap(s, f, w.nightFrom.getTime(), w.to.getTime()) : 0;
    longest = { minutes, day, night: inNight * 2 >= f - s };
  }

  // Gaps between consecutive feed starts of this twin (a tandem feed is one entry per twin).
  // Consecutive starts that are more than one day apart had a whole day without feeds in between:
  // that is missing data, not a long gap. So is any gap of a full day or more.
  const starts = own
    .filter((e) => e.type === 'feed' && startOf(e) >= weekFrom && startOf(e) < weekTo)
    .map((e) => new Date(e.start))
    .sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const ms = starts[i].getTime() - starts[i - 1].getTime();
    const dayStep = differenceInCalendarDays(parseISO(insightDayOf(starts[i], night)), parseISO(insightDayOf(starts[i - 1], night)));
    if (dayStep <= 1 && ms < DAY_MS) gaps.push(ms / MIN);
  }

  const avg = (total: number) => total / n;
  const fed = n > 0 && feeds > 0;
  return {
    days: n,
    longestSleep: longest,
    sleepPerDay:
      n > 0 && sawSleep
        ? {
            total: Math.round(avg(sleepDay + sleepNight) / MIN),
            day: Math.round(avg(sleepDay) / MIN),
            night: Math.round(avg(sleepNight) / MIN),
          }
        : null,
    feedGapMin: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
    feedsPerDay: fed ? Math.round(avg(feeds) * 10) / 10 : null,
    mlPerDay: fed && ml > 0 ? Math.round(avg(ml)) : null,
    breastMinPerDay: fed && breast > 0 ? Math.round(avg(breast)) : null,
    todayLeftOut: finished.length < windows.length && windows.some((w) => w.from.getTime() <= nowMs),
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
