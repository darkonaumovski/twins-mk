import type { DataStore, Repository } from '@/data/repository';
import type { BabyScope, CaregiverId, Entity, ISODateTime, LogEntry, NewRecord, ReminderKind } from '@/data/types';
import { buildEntries, type Who } from '@/features/log/logic';
import { addDays, startOfDay } from 'date-fns';
import { medOccurrenceGiven, slotsFor, subjectId, toMedLogs } from './logic';

/** What a routine or medicine push reminder carries for its "Done" and "Snooze" buttons. */
export interface ReminderActionData {
  kind: ReminderKind;
  routineId: string;
  /** The occurrence (ISO), as the app's "Coming up" marks it done. */
  occurrence: ISODateTime;
  /** The twins (or `none`, the mother) the reminder was for. */
  babies: BabyScope;
  /** A medicine routine: "Done" also logs the dose. */
  med: boolean;
  /** The reminder's key on the server (a snooze refers to it). */
  key: string;
  title: string;
}

export type ReminderAction = 'done' | 'snooze';

export const SNOOZE_MS = 15 * 60_000;

/** Fixed ids, so pressing "Done" twice (or on two phones) changes nothing the second time. */
export const doneId = (routineId: string, occurrence: ISODateTime) => `done-${routineId}-${occurrence}`;
export const doseId = (routineId: string, occurrence: ISODateTime, subject: string) => `dose-${routineId}-${occurrence}-${subject}`;
export const snoozeId = (key: string) => `snooze-${key}`;

/** Whether a message from the service worker (or a notification's data) is a usable reminder action. */
export function isReminderActionData(value: unknown): value is ReminderActionData {
  const d = value as Partial<ReminderActionData> | null;
  return (
    !!d &&
    typeof d.routineId === 'string' &&
    typeof d.occurrence === 'string' &&
    typeof d.key === 'string' &&
    typeof d.babies === 'string' &&
    !Number.isNaN(Date.parse(d.occurrence))
  );
}

/** Creates the record with this id, or brings back one that was deleted; leaves a live one alone. */
async function ensure<T extends Entity>(repo: Repository<T>, id: string, fields: NewRecord<T>): Promise<boolean> {
  const existing = await repo.getAny(id);
  if (existing && existing.deletedAt === null) return false;
  if (existing) {
    await repo.restore(id);
    await repo.update(id, fields as Partial<Omit<T, keyof Entity>>);
  } else {
    await repo.create({ ...fields, id });
  }
  return true;
}

/**
 * "Done" or "Snooze" from a push reminder, written through the normal store (so the outbox picks it up).
 * Done marks the occurrence (the record "Coming up" makes) and, for a medicine routine, logs the dose the
 * way Today's one-tap does: a `med` entry per twin (linked when both) or a dose for the mother.
 */
export async function applyReminderAction(
  store: Pick<DataStore, 'routineDone' | 'routines' | 'logs' | 'motherLogs' | 'reminderSnoozes' | 'transaction'>,
  action: ReminderAction,
  data: ReminderActionData,
  now: Date,
  loggedBy: CaregiverId,
): Promise<void> {
  await store.transaction(async () => {
    if (action === 'snooze') {
      const until = new Date(now.getTime() + SNOOZE_MS).toISOString();
      const id = snoozeId(data.key);
      if (!(await ensure(store.reminderSnoozes, id, { reminderKey: data.key, until }))) {
        await store.reminderSnoozes.update(id, { until });
      }
      return;
    }

    // Already marked in the app ("Coming up" uses a random id), or by this button before: nothing to add.
    const marked = (await store.routineDone.list()).some((d) => d.routineId === data.routineId && d.occurrence === data.occurrence);
    if (!marked) {
      await ensure(store.routineDone, doneId(data.routineId, data.occurrence), { routineId: data.routineId, occurrence: data.occurrence });
    }
    if (!data.med) return;
    const routine = await store.routines.get(data.routineId);
    if (!routine?.med || routine.rule.kind !== 'everyDays') return;
    const { name, dose } = routine.med;
    const start = now.toISOString();

    // A dose already logged for this time (Daily care, the Mother card, or the other phone) is not logged again.
    const at = new Date(data.occurrence);
    const from = startOfDay(at);
    const to = addDays(from, 1);
    const [dayEntries, mother] = await Promise.all([store.logs.listBetween(from.toISOString(), to.toISOString()), store.motherLogs.list()]);
    const given = toMedLogs(dayEntries, mother);
    const needs = (babies: BabyScope) => !medOccurrenceGiven({ ...routine, babies }, at, given);

    if (data.babies === 'none' && needs('none')) {
      await ensure(store.motherLogs, doseId(data.routineId, data.occurrence, subjectId('mother')), {
        type: 'med',
        start,
        data: { name, dose },
        loggedBy,
      });
    }
    const slots = slotsFor(data.babies).filter((slot) => needs(slot));
    if (slots.length === 0) return;
    const who: Who = slots.length === 2 ? 'both' : slots[0];
    const entries = buildEntries(who, { type: 'med', data: { name, dose }, start, end: null }, loggedBy, () =>
      doseId(data.routineId, data.occurrence, 'group'),
    );
    for (const entry of entries) {
      await ensure(store.logs, doseId(data.routineId, data.occurrence, entry.babyId), entry as NewRecord<LogEntry>);
    }
  });
}
