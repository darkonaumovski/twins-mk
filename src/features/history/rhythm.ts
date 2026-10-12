import { parseISO } from 'date-fns';
import type { ISODate, LogEntry, TwinSlot } from '@/data/types';
import { BABY_IDS } from '@/features/log/logic';
import { localDay } from './summary';

const MIN = 60_000;

/** A stretch of sleep within one local day, in minutes since that day's midnight. */
export interface RhythmSegment {
  from: number;
  to: number;
  /** Still running: the segment ends at "now". */
  running: boolean;
}

/** A feed start, in whole minutes since midnight (as the clock shows it). */
export interface RhythmFeed {
  at: number;
  /** Logged for both twins at once (tandem, "both"); set by `buildRows` when the other twin's half is there too. */
  linked: boolean;
  groupId: string | null;
}

export interface RhythmDay {
  day: ISODate;
  /** Minutes in this local day: 1440, or 1380 / 1500 on a daylight-saving change. */
  length: number;
  sleeps: RhythmSegment[];
  feeds: RhythmFeed[];
}

/**
 * One twin's day for the rhythm chart: sleep clipped to the local day (a sleep across midnight is
 * split between the two days, a running one reaches `now`) and the feeds that start on the day.
 * Positions are real minutes since midnight, so a daylight-saving day is 23 or 25 hours long.
 */
export function rhythmDay(entries: readonly LogEntry[], babyId: string, day: ISODate, now: Date): RhythmDay {
  const { from, to } = localDay(day);
  const start = from.getTime();
  const end = to.getTime();
  const nowMs = now.getTime();
  const sleeps: RhythmSegment[] = [];
  const feeds: RhythmFeed[] = [];

  for (const e of entries) {
    if (e.babyId !== babyId || e.deletedAt !== null) continue;
    const s = new Date(e.start).getTime();
    if (e.type === 'sleep') {
      const running = e.end === null;
      // A sleep never reaches past now (an end typed in the future, or a running timer).
      const stop = Math.min(running ? nowMs : new Date(e.end!).getTime(), nowMs);
      const a = Math.max(s, start);
      const b = Math.min(stop, end);
      if (b > a) sleeps.push({ from: (a - start) / MIN, to: (b - start) / MIN, running: running && nowMs <= end });
    } else if (e.type === 'feed' && s >= start && s < end) {
      feeds.push({ at: Math.floor((s - start) / MIN), linked: false, groupId: e.groupId || null });
    }
  }
  sleeps.sort((x, y) => x.from - y.from);
  feeds.sort((x, y) => x.at - y.at);
  return { day, length: (end - start) / MIN, sleeps, feeds };
}

/** Overlapping sleeps (two timers by mistake) joined, so no minute counts twice. */
function union(segments: readonly RhythmSegment[]): [number, number][] {
  const out: [number, number][] = [];
  for (const { from, to } of [...segments].sort((x, y) => x.from - y.from)) {
    const last = out.at(-1);
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else out.push([from, to]);
  }
  return out;
}

export interface InStep {
  /** Minutes both twins were asleep at the same time. */
  sharedSleepMin: number;
  /** Feeds of A and B that started within the window of each other, each feed matched at most once. */
  feedsTogether: number;
  feedsA: number;
  feedsB: number;
}

/** How in step the twins were on one day. Descriptive only: no score, no judgement. */
export function inStep(a: RhythmDay, b: RhythmDay, windowMin: number): InStep {
  const sa = union(a.sleeps);
  const sb = union(b.sleeps);
  let shared = 0;
  for (let i = 0, j = 0; i < sa.length && j < sb.length;) {
    shared += Math.max(0, Math.min(sa[i][1], sb[j][1]) - Math.max(sa[i][0], sb[j][0]));
    if (sa[i][1] < sb[j][1]) i++;
    else j++;
  }

  // Greedy one-to-one matching in time order. On a line with a fixed window this finds the most pairs.
  const fa = a.feeds.map((f) => f.at);
  const fb = b.feeds.map((f) => f.at);
  let together = 0;
  for (let i = 0, j = 0; i < fa.length && j < fb.length;) {
    if (Math.abs(fa[i] - fb[j]) <= windowMin) {
      together++;
      i++;
      j++;
    } else if (fa[i] < fb[j]) i++;
    else j++;
  }

  return { sharedSleepMin: Math.round(shared), feedsTogether: together, feedsA: fa.length, feedsB: fb.length };
}

/** Minutes from the day's midnight to the local clock time `HH:mm` on that day (DST-aware). */
export function minuteOfDay(day: ISODate, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  const midnight = parseISO(day);
  const at = new Date(midnight.getFullYear(), midnight.getMonth(), midnight.getDate(), h || 0, m || 0);
  return (at.getTime() - midnight.getTime()) / MIN;
}

/**
 * The night hours of one day as minute ranges. 19:00–07:00 gives the early morning and the
 * evening; a range within the day (00:00–06:00) gives one band; equal times give none.
 */
export function nightBands(day: ISODate, night: { from: string; to: string }, length: number): [number, number][] {
  const from = minuteOfDay(day, night.from);
  const to = minuteOfDay(day, night.to);
  if (from === to) return [];
  if (from < to) return [[from, to]];
  return [
    [0, to],
    [from, length],
  ].filter(([a, b]) => b > a) as [number, number][];
}

/** Minutes asleep on the day, overlapping sleeps counted once. */
export function sleptMinutes(day: RhythmDay): number {
  return Math.round(union(day.sleeps).reduce((sum, [a, b]) => sum + b - a, 0));
}

export interface RhythmRow {
  day: ISODate;
  twins: Record<TwinSlot, RhythmDay>;
  step: InStep;
}

/** Both twins' rhythm and how in step they were, for each day (in the order given). */
export function buildRows(entries: readonly LogEntry[], days: readonly ISODate[], now: Date, windowMin: number): RhythmRow[] {
  return days.map((day) => {
    const twins = { A: rhythmDay(entries, BABY_IDS.A, day, now), B: rhythmDay(entries, BABY_IDS.B, day, now) };
    // A "both twins" feed is drawn through both rows only while both halves exist (one may have been deleted or moved).
    const groups = (d: RhythmDay) => new Set(d.feeds.map((f) => f.groupId).filter(Boolean));
    const inA = groups(twins.A);
    const inB = groups(twins.B);
    for (const f of twins.A.feeds) f.linked = f.groupId !== null && inB.has(f.groupId);
    for (const f of twins.B.feeds) f.linked = f.groupId !== null && inA.has(f.groupId);
    return { day, twins, step: inStep(twins.A, twins.B, windowMin) };
  });
}
