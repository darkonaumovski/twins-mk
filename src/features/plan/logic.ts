import { addDays, differenceInCalendarDays, parseISO, startOfDay } from 'date-fns';
import type { Appointment, BabyScope, ISODate, ParentTask, Routine, RoutineDone, TwinSlot } from '@/data/types';
import { todayISO } from '@/lib/format';

export interface UpcomingItem {
  /** Stable key for one occurrence; used for "done" marks and to avoid duplicate notifications. */
  key: string;
  kind: 'routine' | 'appointment' | 'task';
  /** The source record id. */
  id: string;
  title: string;
  /** When it is due; `null` for tasks that only have a due date. */
  at: Date | null;
  babies: BabyScope;
  /** Scheduled routine occurrence (ISO) that can be marked done. */
  occurrence?: string;
  /** "Every N hours after the last entry": completed by logging, not by a done mark. */
  auto?: boolean;
  location?: string;
  /** Due date for tasks. */
  due?: ISODate;
}

/** "HH:mm" on a given local day. */
function atTime(day: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Occurrences of a scheduled routine ("every N days at …") in [from, to). */
export function scheduledOccurrences(routine: Routine, from: Date, to: Date): Date[] {
  if (routine.rule.kind !== 'everyDays' || !routine.active) return [];
  const { days, times, startDate } = routine.rule;
  const start = parseISO(startDate);
  const result: Date[] = [];
  for (let day = startOfDay(from); day < to; day = addDays(day, 1)) {
    const diff = differenceInCalendarDays(day, start);
    if (diff < 0 || diff % Math.max(1, days) !== 0) continue;
    for (const time of times) {
      const at = atTime(day, time);
      if (at >= from && at < to) result.push(at);
    }
  }
  return result.sort((a, b) => a.getTime() - b.getTime());
}

/** Twins a scope refers to. */
export function slotsFor(scope: BabyScope): TwinSlot[] {
  return scope === 'both' ? ['A', 'B'] : scope === 'none' ? [] : [scope];
}

export interface UpcomingInput {
  routines: readonly Routine[];
  done: readonly RoutineDone[];
  /** Start time of the latest entry per twin and log type, for "after the last" routines. */
  latest: Partial<Record<TwinSlot, Partial<Record<string, string>>>>;
  appointments: readonly Appointment[];
  tasks: readonly ParentTask[];
  now: Date;
  /** Routine occurrences and appointments are included from `now - pastMs` to `now + aheadMs`. */
  pastMs: number;
  aheadMs: number;
  /** Appointments usually deserve a longer look-ahead than routines (default: `aheadMs`). */
  appointmentAheadMs?: number;
}

/**
 * What is coming up: routine occurrences not yet done, appointments, and open
 * tasks due today or earlier. Overdue and timed items come first, by time.
 */
export function upcomingItems(input: UpcomingInput): UpcomingItem[] {
  const { now } = input;
  const from = new Date(now.getTime() - input.pastMs);
  const to = new Date(now.getTime() + input.aheadMs);
  const doneKeys = new Set(input.done.filter((d) => d.deletedAt === null).map((d) => `${d.routineId}@${d.occurrence}`));
  const items: UpcomingItem[] = [];

  for (const r of input.routines) {
    if (!r.active || r.deletedAt !== null) continue;
    if (r.rule.kind === 'everyDays') {
      for (const at of scheduledOccurrences(r, from, to)) {
        const occurrence = at.toISOString();
        if (doneKeys.has(`${r.id}@${occurrence}`)) continue;
        items.push({ key: `routine:${r.id}:${occurrence}`, kind: 'routine', id: r.id, title: r.title, at, babies: r.babies, occurrence });
      }
    } else {
      // One reminder per twin, counted from that twin's own latest entry.
      for (const slot of slotsFor(r.babies)) {
        const last = input.latest[slot]?.[r.rule.logType];
        if (!last) continue;
        const at = new Date(new Date(last).getTime() + r.rule.hours * 3600_000);
        if (at >= to) continue;
        items.push({
          key: `routine:${r.id}:${slot}:${at.toISOString()}`,
          kind: 'routine',
          id: r.id,
          title: r.title,
          at,
          babies: slot,
          auto: true,
        });
      }
    }
  }

  const apptTo = new Date(now.getTime() + (input.appointmentAheadMs ?? input.aheadMs));
  for (const a of input.appointments) {
    if (a.deletedAt !== null) continue;
    const at = new Date(a.start);
    if (at < from || at >= apptTo) continue;
    items.push({
      key: `appointment:${a.id}:${a.start}`,
      kind: 'appointment',
      id: a.id,
      title: a.title,
      at,
      babies: a.babies,
      location: a.location,
    });
  }

  const today = todayISO(now);
  for (const task of input.tasks) {
    if (task.done || task.deletedAt !== null || !task.due || task.due > today) continue;
    items.push({ key: `task:${task.id}`, kind: 'task', id: task.id, title: task.title, at: null, babies: 'none', due: task.due });
  }

  return items.sort((a, b) => {
    if (a.at && b.at) return a.at.getTime() - b.at.getTime();
    if (a.at) return -1;
    if (b.at) return 1;
    return (a.due ?? '').localeCompare(b.due ?? '');
  });
}

/** When to remind: routines at their time, appointments an hour before. */
export const APPOINTMENT_LEAD_MS = 60 * 60_000;

export function reminderTime(item: UpcomingItem): Date | null {
  if (!item.at) return null;
  return item.kind === 'appointment' ? new Date(item.at.getTime() - APPOINTMENT_LEAD_MS) : item.at;
}

/** Tasks sorted for the list: open first (overdue, then by due date, undated last), done at the end. */
export function sortTasks(tasks: readonly ParentTask[]): ParentTask[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.due && b.due) return a.due.localeCompare(b.due) || a.createdAt.localeCompare(b.createdAt);
    if (a.due) return -1;
    if (b.due) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}
