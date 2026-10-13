import { format } from 'date-fns';
import type { Repository } from '@/data/repository';
import type { AppliedChange } from '@/data/sync/types';
import type { CaregiverId, CheckinData, ISODate, ISODateTime, MotherLog, Pump } from '@/data/types';
import { localDay } from '@/features/history/summary';
import { finishedPumps } from '@/features/milk/logic';

type CheckinLog = Extract<MotherLog, { type: 'checkin' }>;
type MedLogEntry = Extract<MotherLog, { type: 'med' }>;

/** One check-in per day with a fixed id, so two phones never make two for the same day. */
export const checkinId = (date: ISODate) => `checkin-${date}`;

/** A check-in's time: noon of its day, so a time zone never moves it to another day. */
export const checkinStart = (date: ISODate): ISODateTime => new Date(`${date}T12:00:00`).toISOString();

/** The day a check-in is for (from its fixed id, or its time for anything else). */
export const checkinDate = (log: MotherLog): ISODate =>
  log.id.startsWith('checkin-') ? log.id.slice('checkin-'.length) : format(new Date(log.start), 'yyyy-MM-dd');

/** Sleep hours as typed ("6", "6,5"): null when empty, `'invalid'` outside 0–24. */
export function parseSleepHours(input: string): number | null | 'invalid' {
  const text = input.trim();
  if (!text) return null;
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 24 ? Math.round(n * 2) / 2 : 'invalid';
}

/**
 * Saves the day's check-in: creates it, or replaces the one already there (also one the other phone
 * made, or one deleted earlier). Editing replaces, so there is always at most one per day.
 */
export async function saveCheckin(
  repo: Repository<MotherLog>,
  date: ISODate,
  data: CheckinData,
  loggedBy: CaregiverId,
): Promise<MotherLog> {
  const id = checkinId(date);
  const fields = { type: 'checkin' as const, start: checkinStart(date), data, loggedBy };
  const existing = (await repo.listAll()).find((m) => m.id === id);
  if (!existing) return repo.create({ ...fields, id });
  if (existing.deletedAt) await repo.restore(id);
  return repo.update(id, fields);
}

/** Live check-ins, newest day first. */
export function checkins(logs: readonly MotherLog[]): CheckinLog[] {
  return logs
    .filter((m): m is CheckinLog => m.type === 'checkin' && m.deletedAt === null)
    .sort((a, b) => checkinDate(b).localeCompare(checkinDate(a)));
}

/** Live notes, newest first. */
export function motherNotes(logs: readonly MotherLog[]): Extract<MotherLog, { type: 'note' }>[] {
  return logs
    .filter((m): m is Extract<MotherLog, { type: 'note' }> => m.type === 'note' && m.deletedAt === null)
    .sort((a, b) => b.start.localeCompare(a.start));
}

/** The mother's medicine doses that start in [from, to), oldest first. */
export function motherMedsBetween(logs: readonly MotherLog[], from: Date, to: Date): MedLogEntry[] {
  const f = from.toISOString();
  const t = to.toISOString();
  return logs
    .filter((m): m is MedLogEntry => m.type === 'med' && m.deletedAt === null && m.start >= f && m.start < t)
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Her doses per day for these days (newest day first), each day's doses in time order. */
export function motherMedsByDay(logs: readonly MotherLog[], days: readonly ISODate[]): { date: ISODate; doses: MedLogEntry[] }[] {
  return [...days].reverse().map((date) => {
    const { from, to } = localDay(date);
    return { date, doses: motherMedsBetween(logs, from, to) };
  });
}

/** Pumping per day (finished sessions only): sessions and millilitres, newest day first. */
export function pumpingByDay(pumps: readonly Pump[], days: readonly ISODate[]): { date: ISODate; sessions: number; ml: number }[] {
  const done = finishedPumps(pumps);
  return [...days].reverse().map((date) => {
    const { from, to } = localDay(date);
    const f = from.toISOString();
    const t = to.toISOString();
    const day = done.filter((p) => p.start >= f && p.start < t);
    return { date, sessions: day.length, ml: day.reduce((n, p) => n + p.totalMl, 0) };
  });
}

/**
 * The mother's own entries are hers: changes from another phone are only announced when the
 * family turned "Tell the other phones about the mother's entries" on.
 */
export function withoutMotherLogs(changes: readonly AppliedChange[], announceMother: boolean): AppliedChange[] {
  return announceMother ? [...changes] : changes.filter((c) => c.collection !== 'motherLogs');
}

/** The local calendar day of a moment. */
export const dayOf = (iso: ISODateTime) => format(new Date(iso), 'yyyy-MM-dd');
