import { addDays, startOfDay } from 'date-fns';
import type { CaregiverId, ISODateTime, LogEntry, NightShift } from '@/data/types';
import { BABY_IDS, SLOTS } from '@/features/log/logic';
import { summarize, type DaySummary } from '@/features/history/summary';
import type { TwinSlot } from '@/data/types';

// ---------- Night duty ----------

/** "HH:mm" on a given local day. */
function at(day: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(day);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

/** A shift's interval starting on `day`; one whose end is not after its start runs past midnight. */
function shiftWindow(shift: NightShift, day: Date): { start: Date; end: Date } {
  const start = at(day, shift.from);
  let end = at(day, shift.to);
  if (end <= start) end = addDays(end, 1);
  return { start, end };
}

export interface OnDuty {
  caregiverId: CaregiverId;
  until: Date;
}

/** Who is on night duty right now (shifts repeat every night), if anyone. */
export function onDutyNow(shifts: readonly NightShift[], now: Date): OnDuty | null {
  const today = startOfDay(now);
  for (const day of [addDays(today, -1), today]) {
    for (const shift of shifts) {
      if (!shift.from || !shift.to || shift.from === shift.to) continue;
      const { start, end } = shiftWindow(shift, day);
      if (now >= start && now < end) return { caregiverId: shift.caregiverId, until: end };
    }
  }
  return null;
}

/**
 * Whether to tell this phone about changes from others. In "only when I'm on duty" mode,
 * changes are kept quiet while someone else is on night duty; outside the shifts they show as usual.
 */
export function alertsAllowed(mode: 'always' | 'onDuty' | undefined, shifts: readonly NightShift[], me: CaregiverId, now: Date): boolean {
  if (mode !== 'onDuty') return true;
  const duty = onDutyNow(shifts, now);
  return !duty || duty.caregiverId === me;
}

// ---------- Handover ----------

/** Only worth a handover card after being away at least this long. */
export const HANDOVER_MIN_GAP_MS = 15 * 60_000;

export interface Handover {
  since: Date;
  perTwin: Record<TwinSlot, DaySummary>;
  /** Who logged the entries, in order of first appearance. */
  loggedBy: CaregiverId[];
  /** Entries started since then. */
  count: number;
}

/**
 * What happened since this phone was last used: per twin feeds, ml, diapers, sleep and
 * medicines, and who logged it. `null` when the gap is short or nothing was logged.
 */
export function handoverSummary(entries: readonly LogEntry[], lastSeenAt: ISODateTime | null | undefined, now: Date): Handover | null {
  if (!lastSeenAt) return null;
  const since = new Date(lastSeenAt);
  if (now.getTime() - since.getTime() < HANDOVER_MIN_GAP_MS) return null;
  const sinceIso = since.toISOString();
  const fresh = entries.filter((e) => e.deletedAt === null && e.start >= sinceIso);
  if (fresh.length === 0) return null;
  const perTwin = Object.fromEntries(SLOTS.map((slot) => [slot, summarize(entries, BABY_IDS[slot], since, now, now)])) as Record<
    TwinSlot,
    DaySummary
  >;
  return { since, perTwin, loggedBy: [...new Set(fresh.map((e) => e.loggedBy))], count: fresh.length };
}
