import { isTimed } from '@/data/logTypes';
import type { CaregiverId, Entity, FeedData, ISODateTime, LogEntry, NewRecord, TwinSlot } from '@/data/types';

/** Babies have fixed ids so both phones create the same two records and never duplicate them on merge. */
export const BABY_IDS: Record<TwinSlot, string> = { A: 'baby-A', B: 'baby-B' };
export const SLOTS: readonly TwinSlot[] = ['A', 'B'];

export type Who = TwinSlot | 'both';

export function babyIdsFor(who: Who): string[] {
  return who === 'both' ? [BABY_IDS.A, BABY_IDS.B] : [BABY_IDS[who]];
}

export function slotOf(babyId: string): TwinSlot {
  return babyId === BABY_IDS.B ? 'B' : 'A';
}

type Distribute<T> = T extends LogEntry ? Omit<T, keyof Entity | 'babyId' | 'groupId' | 'loggedBy'> : never;
/** What the user entered once; it becomes one entry per selected baby. */
export type LogDraft = Distribute<LogEntry>;

/**
 * One entry per baby; a "both" action links its two entries with a shared groupId.
 * `draft` can differ per baby (e.g. tandem breastfeeding on different sides).
 */
export function buildEntries(
  who: Who,
  draft: LogDraft | ((babyId: string) => LogDraft),
  loggedBy: CaregiverId,
  newGroupId: () => string,
): NewRecord<LogEntry>[] {
  const babyIds = babyIdsFor(who);
  const groupId = babyIds.length > 1 ? newGroupId() : null;
  return babyIds.map(
    (babyId) => ({ ...(typeof draft === 'function' ? draft(babyId) : draft), babyId, groupId, loggedBy }) as NewRecord<LogEntry>,
  );
}

export type BreastSide = Extract<FeedData, { method: 'breast' }>['side'];

/** The side of a twin's most recent breastfeed, so parents can alternate. */
export function lastSide(entries: readonly LogEntry[], babyId: string): BreastSide | null {
  let newest: LogEntry | null = null;
  for (const e of entries) {
    if (e.babyId !== babyId || e.deletedAt !== null || e.type !== 'feed' || e.data.method !== 'breast') continue;
    if (!newest || e.start > newest.start) newest = e;
  }
  return newest?.type === 'feed' && newest.data.method === 'breast' ? newest.data.side : null;
}

/** Bottle millilitres in a feed: the bottle itself, or the top-up after a breastfeed. */
export function feedMl(data: FeedData): number {
  return data.method === 'bottle' ? data.ml : (data.topUp?.ml ?? 0);
}

/** When the next feed is due, from the parents' own interval. `null` without an interval or a previous feed. */
export function nextFeedDue(lastFeedStart: ISODateTime | undefined, intervalMin: number | null | undefined): Date | null {
  if (!lastFeedStart || !intervalMin || intervalMin <= 0) return null;
  return new Date(new Date(lastFeedStart).getTime() + intervalMin * 60_000);
}

/**
 * Whether to offer feeding the other twin as well: its next feed (from its own
 * interval) is due within `windowMin` minutes, or already due, and it is not feeding now.
 */
export function shouldNudge(input: {
  otherLastFeedStart: ISODateTime | undefined;
  otherIntervalMin: number | null | undefined;
  otherFeeding: boolean;
  windowMin: number;
  now: Date;
}): boolean {
  if (input.otherFeeding || input.windowMin <= 0) return false;
  const due = nextFeedDue(input.otherLastFeedStart, input.otherIntervalMin);
  return due !== null && due.getTime() - input.now.getTime() <= input.windowMin * 60_000;
}

export interface SleepPlan {
  /** Running sleep entries to stop. */
  stop: LogEntry[];
  /** Baby ids to start a sleep for. */
  start: string[];
}

/**
 * One button toggles sleep for the selected baby or babies. If every selected
 * baby is asleep it wakes them; otherwise it starts sleep for those awake
 * (never stopping one twin while starting the other).
 */
export function planSleepToggle(who: Who, running: readonly LogEntry[]): SleepPlan {
  const ids = babyIdsFor(who);
  const sleeping = running.filter((e) => e.type === 'sleep' && e.end === null && ids.includes(e.babyId));
  const asleepIds = new Set(sleeping.map((e) => e.babyId));
  if (ids.every((id) => asleepIds.has(id))) return { stop: sleeping, start: [] };
  return { stop: [], start: ids.filter((id) => !asleepIds.has(id)) };
}

export function runningFor(running: readonly LogEntry[], babyId: string): LogEntry[] {
  return running.filter((e) => e.babyId === babyId && e.end === null && isTimed(e));
}

/** Whole minutes between two instants (never negative). */
export function minutesBetween(from: ISODateTime | Date, to: ISODateTime | Date): number {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Math.max(0, Math.floor(ms / 60_000));
}

export function splitMinutes(total: number): { h: number; m: number } {
  return { h: Math.floor(total / 60), m: total % 60 };
}

/** Value for <input type="datetime-local"> in local time, e.g. "2026-10-11T14:05". */
export function toLocalInput(iso: ISODateTime): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parses a datetime-local value (local time) back to an ISO timestamp. */
export function fromLocalInput(value: string): ISODateTime | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Start of the local day containing `date`, and of the next day, as ISO strings. */
export function dayBounds(date: Date): { from: ISODateTime; to: ISODateTime } {
  const from = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const to = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export interface StopBoth {
  /** `sleep` or `feed` (breastfeeding). */
  kind: 'sleep' | 'feed';
  /** One running entry per twin. */
  entries: LogEntry[];
}

/** Timers of the same kind running for both twins at once, so one tap can stop both. */
export function stopBothGroups(running: readonly LogEntry[]): StopBoth[] {
  const groups: StopBoth[] = [];
  for (const kind of ['sleep', 'feed'] as const) {
    const entries = [BABY_IDS.A, BABY_IDS.B].map((id) =>
      running.find((e) => e.babyId === id && e.type === kind && e.end === null && isTimed(e)),
    );
    if (entries.every((e): e is LogEntry => e !== undefined)) groups.push({ kind, entries });
  }
  return groups;
}
