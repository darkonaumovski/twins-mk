import { isKnownLog } from '@/data/logTypes';
import { formatSeconds, isFirstAfterGap } from '@/features/contractions/logic';
import type { AppliedChange } from '@/data/sync/types';
import type {
  Appointment,
  Baby,
  Caregiver,
  CaregiverId,
  Category,
  Contraction,
  DoctorNote,
  LogEntry,
  Milestone,
  MilkStashItem,
  ParentTask,
  PrepItem,
  PrepStatus,
  Pump,
  Routine,
  RoutineDone,
  Supply,
  Vaccine,
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

/**
 * Leaves out contraction changes that are not news: only the first contraction after a pause of
 * more than 2 hours is announced ("contractions are being timed"), not every one, nor each stop.
 * `contractions` is this phone's list after the changes were applied.
 */
export function withoutRoutineContractions(changes: readonly AppliedChange[], contractions: readonly Contraction[]): AppliedChange[] {
  return changes.filter(
    // A brand-new contraction only: an undone delete (a restore) is not news.
    (c) =>
      c.collection !== 'contractions' ||
      (!c.previous && c.record.deletedAt === null && isFirstAfterGap(c.record as Contraction, contractions)),
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
  /** A calendar day, e.g. "14 Oct". */
  day: (date: string) => string;
  /** Name of a parent or helper. */
  parentName: (id: CaregiverId) => string;
  /** Everyone in the family (parents and helpers), to tell who else could have made a change. */
  caregiverIds: readonly CaregiverId[];
  /** Describing an announcement (after `withoutRoutineContractions`), not a history entry. */
  announcing?: boolean;
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
    case 'pumps': {
      const pump = c.record as Pump;
      const prev = c.previous as Pump | undefined;
      // The pumping timer: announced when it starts and when it stops, not as "0 ml".
      if (action === 'added' && pump.end === null) return t('changes.pumps.started');
      if (action === 'changed' && prev?.end === null && pump.end) {
        const minutes = pump.minutes ?? 0;
        return pump.totalMl > 0 ? t('changes.pumps.finishedMl', { minutes, ml: pump.totalMl }) : t('changes.pumps.finished', { minutes });
      }
      return t(`changes.pumps.${action}`, { ml: pump.totalMl });
    }
    case 'milkStash': {
      const item = c.record as MilkStashItem;
      const prev = c.previous as MilkStashItem | undefined;
      if (action === 'changed' && prev?.deletedAt === null) {
        if (item.usedAt && !prev.usedAt) return t('changes.milkStash.used', { ml: prev.ml });
        if (item.ml < prev.ml) return t('changes.milkStash.usedPart', { ml: prev.ml - item.ml, left: item.ml });
      }
      return t(`changes.milkStash.${action}`, { ml: item.ml, place: t(`stash.in.${item.location}`) });
    }
    case 'supplies':
      return t('changes.supplies', { name: t(`supplies.${(c.record as Supply).source}`) });
    case 'caregivers':
      return t(`changes.caregivers.${action}`, { name: (c.record as Caregiver).name });
    case 'milestones': {
      const m = c.record as Milestone;
      const title = m.key ? t(`milestones.keys.${m.key}`) : m.title;
      if (action === 'deleted' || !m.date) return t('changes.milestones.deleted', { title, twin: h.twin(m.babyId) });
      return t('changes.milestones.added', { title, twin: h.twin(m.babyId), when: h.day(m.date) });
    }
    case 'contractions': {
      const ct = c.record as Contraction;
      if (action === 'added')
        return t(h.announcing ? 'changes.contractions.timingStarted' : 'changes.contractions.added', { when: h.when(ct.start) });
      if (action === 'deleted') return t('changes.contractions.deleted');
      if (ct.end)
        return t('changes.contractions.finished', { duration: formatSeconds((Date.parse(ct.end) - Date.parse(ct.start)) / 1000) });
      return t('changes.contractions.changed');
    }
    case 'vaccines': {
      const v = c.record as Vaccine;
      return t(`changes.vaccines.${action}`, { name: v.name, twin: h.twin(v.babyId), when: h.day(v.date) });
    }
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
 * Summarises changes from another phone, credited to who made them (`updatedBy`). On records
 * from older versions, log entries and pumping sessions name who logged them; anything else is credited to the only other person in the family,
 * or to "the other phone" when there are helpers too and it could have been anyone.
 */
export function summarizeChanges(changes: readonly AppliedChange[], me: CaregiverId, h: ChangeTextHelpers, max = 3): ChangeSummary | null {
  if (!changes.length) return null;
  // Newest first, and one line per distinct text (a "both twins" feed is two records).
  const ordered = [...changes].sort((a, b) => b.record.updatedAt.localeCompare(a.record.updatedAt));
  const lines = [...new Set(ordered.map((c) => changeLine(c, h)))];
  // Newer versions stamp who made each change; on older records, log entries and pumping sessions say who logged them.
  const stamped = ordered.find((c) => c.record.updatedBy);
  const log = ordered.find((c) => c.collection === 'logs' || c.collection === 'pumps');
  const others = h.caregiverIds.filter((id) => id !== me);
  const author: CaregiverId | null = stamped
    ? stamped.record.updatedBy!
    : log
      ? (log.record as LogEntry | Pump).loggedBy
      : others.length === 1
        ? others[0]
        : null;
  const who = author ? h.parentName(author) : h.t('changes.otherPhone');

  const shown = lines.slice(0, max);
  const rest = lines.length - shown.length;
  const body = [...shown, ...(rest > 0 ? [h.t('changes.more', { count: rest })] : [])].join('\n');
  const toast =
    lines.length === 1
      ? h.t('changes.toastOne', { who, line: lines[0] })
      : h.t('changes.toastMany', { who, line: lines[0], count: lines.length - 1 });
  return { title: author ? h.t('changes.title', { who }) : h.t('changes.titleOtherPhone'), body, toast };
}
