import { isKnownLog } from '@/data/logTypes';
import type { AppliedChange } from '@/data/sync/types';
import type {
  Appointment,
  Baby,
  Category,
  DoctorNote,
  LogEntry,
  ParentId,
  ParentTask,
  PrepItem,
  PrepStatus,
  Routine,
  RoutineDone,
} from '@/data/types';

export type ChangeAction = 'added' | 'changed' | 'deleted';

/** What happened to a record, seen from this phone. `null` means nothing worth telling. */
export function changeAction(c: AppliedChange): ChangeAction | null {
  const isLive = c.record.deletedAt === null;
  const wasLive = c.previous ? c.previous.deletedAt === null : false;
  if (isLive && !wasLive) return 'added'; // new, or an undone delete
  if (!isLive) return wasLive ? 'deleted' : null; // a delete of something never shown here
  return 'changed';
}

/** Changes made on another phone that are worth telling this phone's user about. */
export function fromOtherPhone(changes: readonly AppliedChange[], ownDeviceId: string): AppliedChange[] {
  return changes.filter(
    (c) =>
      c.record.deviceId !== ownDeviceId &&
      c.record.deviceId !== 'seed' &&
      changeAction(c) !== null &&
      // Entries of a type this version cannot describe (from a newer version) are not announced.
      !(c.collection === 'logs' && !isKnownLog(c.record as LogEntry)),
  );
}

export interface ChangeTextHelpers {
  t: (key: string, options?: Record<string, unknown>) => string;
  /** Title and detail of a log entry, e.g. "Bottle" / "120 ml · formula". */
  entry: (entry: LogEntry) => { title: string; detail: string };
  twin: (babyId: string) => string;
  /** Name of a checklist record, translated while it is still the starter text. */
  label: (record: { name: string; seedKey: string | null }) => string;
  routineTitle: (routineId: string) => string | undefined;
  /** Short date and time, e.g. "14 Oct 10:30". */
  when: (iso: string) => string;
  parentName: (parent: ParentId) => string;
}

const short = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** One line describing a change, e.g. "Bottle · Ema · 120 ml formula". */
export function changeLine(c: AppliedChange, h: ChangeTextHelpers): string {
  const action = changeAction(c) ?? 'changed';
  const { t } = h;
  switch (c.collection) {
    case 'logs': {
      const entry = c.record as LogEntry;
      const prev = c.previous as LogEntry | undefined;
      const { title, detail } = h.entry(entry);
      const base = { what: title, twin: h.twin(entry.babyId), detail };
      if (action === 'changed' && prev && prev.end === null && entry.end !== null) return t('changes.logs.finished', base);
      if (action === 'added') return t(detail ? 'changes.logs.addedDetail' : 'changes.logs.added', base);
      return t(`changes.logs.${action}`, base);
    }
    case 'prepItems': {
      const item = c.record as PrepItem;
      const prev = c.previous as PrepItem | undefined;
      const name = h.label(item);
      if (action === 'changed' && prev) {
        if (item.kind === 'task' && prev.done !== item.done)
          return t(item.done ? 'changes.prepItems.done' : 'changes.prepItems.undone', { name });
        if (prev.status !== item.status) {
          return t('changes.prepItems.status', { name, status: t(`status.${item.status satisfies PrepStatus}`) });
        }
      }
      return t(`changes.prepItems.${action}`, { name });
    }
    case 'categories':
      return t(`changes.categories.${action}`, { name: h.label(c.record as Category) });
    case 'tasks': {
      const task = c.record as ParentTask;
      const prev = c.previous as ParentTask | undefined;
      if (action === 'changed' && prev && prev.done !== task.done) {
        return t(task.done ? 'changes.tasks.done' : 'changes.tasks.undone', { title: task.title });
      }
      return t(`changes.tasks.${action}`, { title: task.title });
    }
    case 'appointments': {
      const appt = c.record as Appointment;
      return t(`changes.appointments.${action}`, { title: appt.title, when: h.when(appt.start) });
    }
    case 'routines':
      return t(`changes.routines.${action}`, { title: (c.record as Routine).title });
    case 'routineDone': {
      const title = h.routineTitle((c.record as RoutineDone).routineId) ?? t('changes.routineDone.unknown');
      return t(action === 'deleted' ? 'changes.routineDone.undone' : 'changes.routineDone.done', { title });
    }
    case 'doctorNotes':
      return t(`changes.doctorNotes.${action}`, { text: short((c.record as DoctorNote).text) });
    case 'babies':
      return t('changes.babies', { name: h.twin(c.record.id) || (c.record as Baby).name });
    case 'settings':
      return t('changes.settings');
  }
}

export interface ChangeSummary {
  /** e.g. "Update from Ana". */
  title: string;
  /** Up to `max` lines, then "and N more". */
  body: string;
  /** One line for the in-app message. */
  toast: string;
}

/**
 * Summarises changes from the other phone. Log entries name the parent who
 * logged them; anything else is credited to the parent this phone is not set to.
 */
export function summarizeChanges(changes: readonly AppliedChange[], me: ParentId, h: ChangeTextHelpers, max = 3): ChangeSummary | null {
  if (!changes.length) return null;
  // Newest first, and one line per distinct text (a "both twins" feed is two records).
  const ordered = [...changes].sort((a, b) => b.record.updatedAt.localeCompare(a.record.updatedAt));
  const lines = [...new Set(ordered.map((c) => changeLine(c, h)))];
  const log = ordered.find((c) => c.collection === 'logs');
  const parent: ParentId = log ? (log.record as LogEntry).loggedBy : me === 'p1' ? 'p2' : 'p1';
  const who = h.parentName(parent);

  const shown = lines.slice(0, max);
  const rest = lines.length - shown.length;
  const body = [...shown, ...(rest > 0 ? [h.t('changes.more', { count: rest })] : [])].join('\n');
  const toast =
    lines.length === 1
      ? h.t('changes.toastOne', { who, line: lines[0] })
      : h.t('changes.toastMany', { who, line: lines[0], count: lines.length - 1 });
  return { title: h.t('changes.title', { who }), body, toast };
}
