/**
 * What the push reminder function sends: the due reminders of one family, who gets
 * them, and the text. Pure, so it runs the same in the Edge Function and in tests, and
 * it reuses the app's own scheduling code, so phones and server agree on what is due.
 */
import type {
  Appointment,
  Baby,
  BabyScope,
  LogEntry,
  MotherLog,
  ReminderKind,
  ReminderSnooze,
  Routine,
  RoutineDone,
  SharedSettings,
  TwinSlot,
} from '../data/types';
import { isKnownLog } from '../data/logTypes';
import { BABY_IDS, nextFeedDue, SLOTS } from '../features/log/logic';
import { medOccurrenceGiven, reminderTime, toMedLogs, upcomingItems } from '../features/plan/logic';
import type { ReminderActionData } from '../features/plan/reminderActions';
import { onDutyNow } from '../features/family/logic';
import en from '../i18n/locales/en';
import mk from '../i18n/locales/mk';

/** The family's records the reminders depend on (as stored on the server). */
export interface FamilyData {
  settings: SharedSettings | undefined;
  babies: Baby[];
  routines: Routine[];
  done: RoutineDone[];
  appointments: Appointment[];
  /** Log entries of the last few days. */
  logs: LogEntry[];
  /** The mother's entries of the last few days (her medicine doses); absent from an older function. */
  motherLogs?: MotherLog[];
  /** "Snooze 15 min" records from the phones' push reminders; absent from an older function. */
  snoozes?: ReminderSnooze[];
}

export interface DueReminder {
  /** Unique per occurrence, so each reminder is sent once. */
  key: string;
  kind: ReminderKind;
  /** When it is due (appointments: an hour before). */
  at: Date;
  /** The routine or appointment title as the parents typed it ('' for "feed due"). */
  title: string;
  babies: BabyScope;
  /** Appointment start, for "at 10:30". */
  start?: Date;
  location?: string;
  /** A scheduled routine occurrence (real time, ISO): the push message gets "Done" and "Snooze". */
  routineId?: string;
  occurrence?: string;
  /** A snoozed reminder sent again: the original key, so it replaces the first notification. */
  snoozedKey?: string;
}

/** The parts of a routine reminder's key (`routine:<id>:<babies>:<occurrence>`), or null for anything else. */
export function parseReminderKey(key: string): { routineId: string; babies: BabyScope; occurrence: string } | null {
  const match = /^routine:([^:]+):(A|B|both|none):(.+)$/.exec(key);
  if (!match || Number.isNaN(Date.parse(match[3]))) return null;
  return { routineId: match[1], babies: match[2] as BabyScope, occurrence: match[3] };
}

/** The function runs every 5 minutes; this covers a late or skipped run. */
export const DUE_WINDOW_MS = 15 * 60_000;
const DEFAULT_TIME_ZONE = 'Europe/Skopje';

/**
 * How far to move instants so that this runtime's local-time functions read the family's
 * wall-clock time. The app's scheduling code works in local time (routines at "09:00"),
 * and the server runs in UTC.
 */
export function zoneShift(timeZone: string, at: Date): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(at);
  } catch {
    return timeZone === DEFAULT_TIME_ZONE ? 0 : zoneShift(DEFAULT_TIME_ZONE, at);
  }
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  const zoneOffset = wallAsUtc - Math.floor(at.getTime() / 1000) * 1000;
  const runtimeOffset = -at.getTimezoneOffset() * 60_000;
  return zoneOffset - runtimeOffset;
}

const move = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();

/** Reminders that came due in the window ending `now`, for one family. */
export function dueReminders(data: FamilyData, now: Date, windowMs = DUE_WINDOW_MS): DueReminder[] {
  const shift = zoneShift(data.settings?.timeZone || DEFAULT_TIME_ZONE, now);
  // Everything below works on "wall-clock" instants; results are moved back at the end.
  const wallNow = new Date(now.getTime() + shift);
  const logs = data.logs
    .filter((e) => e.deletedAt === null && isKnownLog(e))
    .map((e) => ({ ...e, start: move(e.start, shift), end: e.end ? move(e.end, shift) : null }) as LogEntry);
  const latest: Partial<Record<TwinSlot, Partial<Record<string, string>>>> = {};
  for (const slot of SLOTS) {
    const mine = logs.filter((e) => e.babyId === BABY_IDS[slot]);
    for (const e of mine) {
      const seen = latest[slot]?.[e.type];
      if (!seen || e.start > seen) latest[slot] = { ...latest[slot], [e.type]: e.start };
    }
  }
  const awaySlots = SLOTS.filter((slot) => data.babies.find((b) => b.id === BABY_IDS[slot])?.location === 'hospital');
  const routinesById = new Map(data.routines.map((r) => [r.id, r]));
  const medLogs = toMedLogs(
    logs,
    (data.motherLogs ?? []).filter((m) => m.deletedAt === null).map((m) => ({ ...m, start: move(m.start, shift) })),
  );

  const items = upcomingItems({
    routines: data.routines,
    done: data.done.map((d) => ({ ...d, occurrence: move(d.occurrence, shift) })),
    latest,
    appointments: data.appointments.map((a) => ({ ...a, start: move(a.start, shift) })),
    tasks: [],
    now: wallNow,
    pastMs: windowMs,
    aheadMs: 60_000,
    appointmentAheadMs: 61 * 60_000,
    medLogs,
    awaySlots,
  });

  const result: DueReminder[] = [];
  const from = wallNow.getTime() - windowMs;
  for (const item of items) {
    const at = reminderTime(item);
    if (!at || at.getTime() < from || at.getTime() > wallNow.getTime()) continue;
    const realAt = new Date(at.getTime() - shift);
    const kind: ReminderKind = item.kind === 'appointment' ? 'appointments' : routinesById.get(item.id)?.med ? 'medicines' : 'routines';
    result.push({
      key: `${item.kind}:${item.id}:${item.babies}:${realAt.toISOString()}`,
      kind,
      at: realAt,
      title: item.title,
      babies: item.babies,
      ...(item.kind === 'appointment' ? { start: new Date(item.at!.getTime() - shift), location: item.location } : {}),
      ...(item.kind === 'routine' && item.occurrence ? { routineId: item.id, occurrence: move(item.occurrence, -shift) } : {}),
    });
  }

  // "Snooze 15 min": the reminder once more at `until`, unless that occurrence was done (or the dose given) meanwhile.
  const doneKeys = new Set(data.done.filter((d) => d.deletedAt === null).map((d) => `${d.routineId}@${d.occurrence}`));
  for (const snooze of data.snoozes ?? []) {
    const until = Date.parse(snooze.until);
    if (snooze.deletedAt !== null || !(until > now.getTime() - windowMs && until <= now.getTime())) continue;
    const parsed = parseReminderKey(snooze.reminderKey);
    const routine = parsed && routinesById.get(parsed.routineId);
    if (!parsed || !routine || !routine.active || routine.deletedAt !== null) continue;
    if (doneKeys.has(`${parsed.routineId}@${parsed.occurrence}`)) continue;
    const wallOccurrence = new Date(Date.parse(parsed.occurrence) + shift);
    if (routine.med && medOccurrenceGiven({ ...routine, babies: parsed.babies }, wallOccurrence, medLogs)) continue;
    result.push({
      key: `snooze:${snooze.reminderKey}:${snooze.until}`,
      kind: routine.med ? 'medicines' : 'routines',
      at: new Date(until),
      title: routine.title,
      babies: parsed.babies,
      routineId: parsed.routineId,
      occurrence: parsed.occurrence,
      snoozedKey: snooze.reminderKey,
    });
  }

  // "Feed due", from each twin's own feed interval (as the parents set it).
  for (const slot of SLOTS) {
    const baby = data.babies.find((b) => b.id === BABY_IDS[slot] && b.deletedAt === null);
    if (!baby?.feedIntervalMin) continue;
    const lastFeed = logs.filter((e) => e.babyId === baby.id && e.type === 'feed').sort((a, b) => b.start.localeCompare(a.start))[0];
    if (!lastFeed) continue;
    // A breastfeed still running: no reminder (bottles never have an end time).
    if (lastFeed.end === null && lastFeed.type === 'feed' && lastFeed.data.method === 'breast') continue;
    const due = nextFeedDue(lastFeed.start, baby.feedIntervalMin);
    if (!due || due.getTime() < from || due.getTime() > wallNow.getTime()) continue;
    const realAt = new Date(due.getTime() - shift);
    result.push({ key: `feed:${baby.id}:${realAt.toISOString()}`, kind: 'feedDue', at: realAt, title: '', babies: slot });
  }
  return result;
}

/** A phone that receives push reminders. */
export interface Subscriber {
  endpoint: string;
  caregiverId: string;
  kinds: ReminderKind[];
  lang: 'mk' | 'en';
}

/**
 * Who gets a reminder: the phones that want this kind. During a night shift only the
 * phones of whoever is on duty, unless none of their phones is subscribed (then everyone,
 * so a reminder is never lost).
 */
export function recipientsFor<S extends Subscriber>(
  subs: readonly S[],
  kind: ReminderKind,
  settings: SharedSettings | undefined,
  now: Date,
): S[] {
  const wanted = subs.filter((s) => s.kinds.includes(kind));
  const shift = zoneShift(settings?.timeZone || DEFAULT_TIME_ZONE, now);
  const duty = onDutyNow(settings?.nightShifts ?? [], new Date(now.getTime() + shift));
  if (!duty) return wanted;
  const onDuty = wanted.filter((s) => s.caregiverId === duty.caregiverId);
  return onDuty.length ? onDuty : wanted;
}

type Strings = typeof en;
const LOCALES: Record<'mk' | 'en', Strings> = { en, mk };

function lookup(strings: Strings, key: string): string {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], strings);
  return typeof value === 'string' ? value : key;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, name: string) => vars[name] ?? '');
}

export interface PushMessage {
  title: string;
  body: string;
  /** Replaces an earlier notification with the same tag instead of stacking up. */
  tag: string;
  /** Where tapping the notification opens the app. */
  url: string;
  /** "Done" and "Snooze 15 min" buttons (Android; iPhone ignores them). */
  actions?: { action: 'done' | 'snooze'; title: string }[];
  /** What the buttons act on. */
  data?: ReminderActionData;
  /** A snoozed reminder sent again: it replaces the first notification (same tag) but should still sound. */
  renotify?: boolean;
}

/** "Vitamin D · Ema", "Paediatrician at 10:30", "Feed due · Ana", in the phone's language. */
export function reminderMessage(reminder: DueReminder, lang: 'mk' | 'en', data: Pick<FamilyData, 'babies' | 'settings'>): PushMessage {
  const strings = LOCALES[lang] ?? LOCALES.mk;
  const t = (key: string, vars: Record<string, string> = {}) => fill(lookup(strings, key), vars);
  const twin = (slot: TwinSlot) =>
    data.babies.find((b) => b.id === BABY_IDS[slot] && b.deletedAt === null)?.name || t(slot === 'A' ? 'twins.twinA' : 'twins.twinB');
  // A medicine "for the mother" says so ("Ibuprofen · for the mother"); other family routines name nobody.
  const none = reminder.kind === 'medicines' ? t('reminders.forMother') : '';
  const who = reminder.babies === 'both' ? t('twins.both') : reminder.babies === 'none' ? none : twin(reminder.babies);
  let title: string;
  let body = '';
  if (reminder.kind === 'appointments' && reminder.start) {
    const local = new Date(reminder.start.getTime() + zoneShift(data.settings?.timeZone || DEFAULT_TIME_ZONE, reminder.start));
    const time = `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`;
    title = t('reminders.appointmentSoon', { title: reminder.title, time });
    body = [who, reminder.location ?? ''].filter(Boolean).join(' · ');
  } else if (reminder.kind === 'feedDue') {
    title = t('reminders.feedDue', { who });
  } else {
    title = who ? t('reminders.routineDue', { title: reminder.title, who }) : reminder.title;
  }
  // An appointment can be before the birth: the start page then picks the screen for the phase.
  const message: PushMessage = {
    title,
    body,
    tag: `reminder:${reminder.snoozedKey ?? reminder.key}`,
    url: reminder.kind === 'appointments' ? './#/' : './#/today',
    ...(reminder.snoozedKey ? { renotify: true } : {}),
  };
  // A scheduled routine or medicine can be marked done or snoozed from the notification.
  if (reminder.routineId && reminder.occurrence && (reminder.kind === 'routines' || reminder.kind === 'medicines')) {
    message.actions = [
      { action: 'done', title: t('reminders.done') },
      { action: 'snooze', title: t('reminders.snooze') },
    ];
    message.data = {
      kind: reminder.kind,
      routineId: reminder.routineId,
      occurrence: reminder.occurrence,
      babies: reminder.babies,
      med: reminder.kind === 'medicines',
      key: reminder.snoozedKey ?? reminder.key,
      title: reminder.title,
    };
  }
  return message;
}

/** The test notification from Settings. */
export function testMessage(lang: 'mk' | 'en'): PushMessage {
  const strings = LOCALES[lang] ?? LOCALES.mk;
  return { title: lookup(strings, 'app.name'), body: lookup(strings, 'reminders.testBody'), tag: 'reminder:test', url: './#/today' };
}
