import { describe, expect, it } from 'vitest';
import type { Appointment, Baby, LogEntry, MotherLog, ReminderSnooze, Routine, RoutineDone, SharedSettings } from '@/data/types';
import { DEFAULT_SETTINGS } from '@/data/defaults';
import { dueReminders, parseReminderKey, recipientsFor, reminderMessage, zoneShift, type FamilyData } from './reminders';

const meta = { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', deletedAt: null, deviceId: 'd' };
const settings = (over: Partial<SharedSettings> = {}): SharedSettings =>
  ({ ...DEFAULT_SETTINGS, ...meta, timeZone: 'Europe/Skopje', ...over }) as SharedSettings;
const baby = (slot: 'A' | 'B', over: Partial<Baby> = {}): Baby => ({
  ...meta,
  id: `baby-${slot}`,
  slot,
  name: slot === 'A' ? 'Ema' : 'Ana',
  color: slot === 'A' ? 'teal' : 'amber',
  birthDateTime: null,
  birthWeightG: null,
  birthLengthCm: null,
  ...over,
});
const vitD: Routine = {
  ...meta,
  id: 'vitd',
  title: 'Витамин Д',
  babies: 'both',
  active: true,
  rule: { kind: 'everyDays', days: 1, times: ['09:00'], startDate: '2026-10-01' },
  med: { name: 'Vitamin D', dose: '', minIntervalHours: null },
};
const bath: Routine = {
  ...vitD,
  id: 'bath',
  title: 'Капење',
  med: null,
  babies: 'A',
  rule: { ...vitD.rule, times: ['19:00'] } as Routine['rule'],
};
const data = (over: Partial<FamilyData> = {}): FamilyData => ({
  settings: settings(),
  babies: [baby('A'), baby('B')],
  routines: [vitD, bath],
  done: [],
  appointments: [],
  logs: [],
  ...over,
});
let n = 0;
const log = (e: Partial<LogEntry> & Pick<LogEntry, 'type' | 'data' | 'start'>): LogEntry =>
  ({ ...meta, id: `l${++n}`, babyId: 'baby-A', end: null, groupId: null, loggedBy: 'p1', ...e }) as LogEntry;

// 11 October 2026: Skopje is on summer time, UTC+2.
const at = (iso: string) => new Date(iso);

describe('time zones', () => {
  it('reads wall-clock times in the family’s zone, wherever the server runs', () => {
    const now = at('2026-10-11T07:00:00Z');
    const local = new Date(now.getTime() + zoneShift('Europe/Skopje', now));
    expect([local.getHours(), local.getMinutes()]).toEqual([9, 0]);
    const ny = new Date(now.getTime() + zoneShift('America/New_York', now));
    expect(ny.getHours()).toBe(3);
  });
});

describe('due reminders', () => {
  it('finds a daily medicine at 09:00 in Skopje (07:00 UTC) a few minutes after', () => {
    const due = dueReminders(data(), at('2026-10-11T07:04:00Z'));
    expect(due.map((d) => [d.kind, d.title, d.babies, d.at.toISOString()])).toEqual([
      ['medicines', 'Витамин Д', 'both', '2026-10-11T07:00:00.000Z'],
    ]);
    expect(due[0].key).toBe('routine:vitd:both:2026-10-11T07:00:00.000Z');
    // Not before it is due, and not long after.
    expect(dueReminders(data(), at('2026-10-11T06:59:00Z'))).toEqual([]);
    expect(dueReminders(data(), at('2026-10-11T07:30:00Z'))).toEqual([]);
  });

  it('uses the family’s own zone', () => {
    const due = dueReminders(data({ settings: settings({ timeZone: 'America/New_York' }) }), at('2026-10-11T13:02:00Z'));
    expect(due.map((d) => d.at.toISOString())).toEqual(['2026-10-11T13:00:00.000Z']);
  });

  it('skips occurrences marked done or already given to both twins', () => {
    const done: RoutineDone = { ...meta, id: 'x', routineId: 'vitd', occurrence: '2026-10-11T07:00:00.000Z' };
    expect(dueReminders(data({ done: [done] }), at('2026-10-11T07:04:00Z'))).toEqual([]);
    const given = ['baby-A', 'baby-B'].map((babyId) =>
      log({ babyId, type: 'med', data: { name: 'vitamin d', dose: '' }, start: '2026-10-11T06:50:00.000Z' }),
    );
    expect(dueReminders(data({ logs: given }), at('2026-10-11T07:04:00Z'))).toEqual([]);
  });

  it('reminds an hour before an appointment, with the local time', () => {
    const appt: Appointment = {
      ...meta,
      id: 'a1',
      title: 'Педијатар',
      babies: 'both',
      start: '2026-10-11T08:30:00.000Z',
      location: 'Дом здравје',
      notes: '',
    };
    const due = dueReminders(data({ routines: [], appointments: [appt] }), at('2026-10-11T07:31:00Z'));
    expect(due.map((d) => [d.kind, d.at.toISOString()])).toEqual([['appointments', '2026-10-11T07:30:00.000Z']]);
    const message = reminderMessage(due[0], 'mk', data());
    expect(message.title).toBe('Педијатар во 10:30');
    expect(message.body).toBe('Двајцата · Дом здравје');
  });

  it('reads well for a pregnancy appointment (no twin)', () => {
    const appt: Appointment = {
      ...meta,
      id: 'a2',
      title: 'Ultrasound',
      babies: 'none',
      start: '2026-10-11T08:30:00.000Z',
      location: 'Clinic',
      notes: '',
    };
    const due = dueReminders(data({ routines: [], appointments: [appt] }), at('2026-10-11T07:31:00Z'));
    expect(due.map((d) => d.babies)).toEqual(['none']);
    expect(reminderMessage(due[0], 'en', data())).toMatchObject({ title: 'Ultrasound at 10:30', body: 'Clinic', url: './#/' });
    const noPlace = reminderMessage({ ...due[0], location: '' }, 'mk', data());
    expect(noPlace).toMatchObject({ title: 'Ultrasound во 10:30', body: '' });
  });

  it('says when a feed is due from the parents’ own interval, but not while a breastfeed runs', () => {
    const babies = [baby('A', { feedIntervalMin: 180 }), baby('B')];
    const bottle = log({ type: 'feed', data: { method: 'bottle', ml: 90, milk: 'formula' }, start: '2026-10-11T04:00:00.000Z' });
    const due = dueReminders(data({ routines: [], babies, logs: [bottle] }), at('2026-10-11T07:02:00Z'));
    expect(due.map((d) => [d.kind, d.babies, d.key])).toEqual([['feedDue', 'A', 'feed:baby-A:2026-10-11T07:00:00.000Z']]);
    expect(reminderMessage(due[0], 'en', { babies, settings: settings() }).title).toBe('Feed due · Ema');

    const running = log({ type: 'feed', data: { method: 'breast', side: 'left' }, start: '2026-10-11T04:00:00.000Z' });
    expect(dueReminders(data({ routines: [], babies, logs: [running] }), at('2026-10-11T07:02:00Z'))).toEqual([]);
  });

  it('leaves out a twin in hospital for "only when home" routines', () => {
    const homeBath = { ...bath, babies: 'both' as const, onlyWhenHome: true };
    const babies = [baby('A', { location: 'hospital' }), baby('B')];
    const due = dueReminders(data({ routines: [homeBath], babies }), at('2026-10-11T17:03:00Z'));
    expect(due.map((d) => d.babies)).toEqual(['B']);
    expect(reminderMessage(due[0], 'mk', { babies, settings: settings() }).title).toBe('Капење · Ana');
  });
});

describe('medicines for the mother', () => {
  const ibuprofen: Routine = {
    ...vitD,
    id: 'ibu',
    title: 'Ibuprofen',
    babies: 'none',
    rule: { kind: 'everyDays', days: 1, times: ['08:00', '20:00'], startDate: '2026-10-01' },
    med: { name: 'Ibuprofen', dose: '400 mg', minIntervalHours: 6 },
  };
  const dose = (start: string): MotherLog => ({
    ...meta,
    id: `m-${start}`,
    type: 'med',
    start,
    data: { name: 'ibuprofen', dose: '400 mg' },
    loggedBy: 'p1',
  });

  it('are due like the twins’ medicines, sent as medicines', () => {
    const due = dueReminders(data({ routines: [ibuprofen] }), at('2026-10-11T06:03:00Z'));
    expect(due.map((d) => [d.kind, d.title, d.babies])).toEqual([['medicines', 'Ibuprofen', 'none']]);
  });

  it('count as done once the mother’s own dose is logged (not a twin’s entry with the same name)', () => {
    const given = data({ routines: [ibuprofen], motherLogs: [dose('2026-10-11T06:01:00Z')] });
    expect(dueReminders(given, at('2026-10-11T06:03:00Z'))).toEqual([]);
    const twinEntry = log({ type: 'med', data: { name: 'Ibuprofen', dose: '' }, start: '2026-10-11T06:01:00Z' });
    expect(dueReminders(data({ routines: [ibuprofen], logs: [twinEntry] }), at('2026-10-11T06:03:00Z'))).toHaveLength(1);
    // A deleted dose does not count; an older function without motherLogs still sends the reminder.
    const deleted = { ...dose('2026-10-11T06:01:00Z'), deletedAt: '2026-10-11T06:02:00Z' };
    expect(dueReminders(data({ routines: [ibuprofen], motherLogs: [deleted] }), at('2026-10-11T06:03:00Z'))).toHaveLength(1);
  });

  it('the second time of the day needs a second dose', () => {
    const one = data({ routines: [ibuprofen], motherLogs: [dose('2026-10-11T06:01:00Z')] });
    expect(dueReminders(one, at('2026-10-11T18:02:00Z')).map((d) => d.title)).toEqual(['Ibuprofen']);
  });

  it('read “Ibuprofen · for the mother” in both languages', () => {
    const [due] = dueReminders(data({ routines: [ibuprofen] }), at('2026-10-11T06:03:00Z'));
    expect(reminderMessage(due, 'en', data()).title).toBe('Ibuprofen · for the mother');
    expect(reminderMessage(due, 'mk', data()).title).toBe('Ibuprofen · за мајката');
  });

  it('leave a family routine that is not a medicine without a name', () => {
    const family: Routine = { ...bath, id: 'family', babies: 'none', title: 'Перење' };
    const [due] = dueReminders(data({ routines: [family] }), at('2026-10-11T17:02:00Z'));
    expect(reminderMessage(due, 'en', data()).title).toBe('Перење');
  });

  it('go to the phones that want medicines, and at night to whoever is on duty', () => {
    const [due] = dueReminders(data({ routines: [ibuprofen] }), at('2026-10-11T06:03:00Z'));
    const subs = [
      { endpoint: 'mom', caregiverId: 'p1', kinds: ['medicines' as const], lang: 'mk' as const },
      { endpoint: 'dad', caregiverId: 'p2', kinds: ['routines' as const], lang: 'en' as const },
    ];
    expect(recipientsFor(subs, due.kind, settings(), due.at).map((s) => s.endpoint)).toEqual(['mom']);
    const night = settings({ nightShifts: [{ caregiverId: 'p2', from: '22:00', to: '09:00' }] });
    // Dad is on duty but has no phone for medicines: Mom still gets it, so it is never lost.
    expect(recipientsFor(subs, due.kind, night, due.at).map((s) => s.endpoint)).toEqual(['mom']);
  });
});

describe('Done and Snooze buttons', () => {
  const nine = '2026-10-11T07:00:00.000Z';
  const key = `routine:vitd:both:${nine}`;
  const snooze = (until: string, over: Partial<ReminderSnooze> = {}): ReminderSnooze => ({
    ...meta,
    id: `snooze-${key}`,
    reminderKey: key,
    until,
    ...over,
  });

  it('puts the routine, occurrence and twins into a medicine or routine reminder', () => {
    const [due] = dueReminders(data(), at('2026-10-11T07:04:00Z'));
    const message = reminderMessage(due, 'en', data());
    expect(message.actions).toEqual([
      { action: 'done', title: 'Done' },
      { action: 'snooze', title: 'Snooze 15 min' },
    ]);
    expect(message.data).toEqual({
      kind: 'medicines',
      routineId: 'vitd',
      occurrence: nine,
      babies: 'both',
      med: true,
      key,
      title: 'Витамин Д',
    });
    expect(reminderMessage(due, 'mk', data()).actions?.map((a) => a.title)).toEqual(['Готово', 'Одложи 15 мин']);
    expect(parseReminderKey(key)).toEqual({ routineId: 'vitd', babies: 'both', occurrence: nine });
  });

  it('gives no buttons to appointments, "feed due" or "every few hours" routines', () => {
    const appt = {
      ...meta,
      id: 'ap',
      title: 'Check-up',
      babies: 'A',
      start: '2026-10-11T09:00:00.000Z',
      location: '',
      notes: '',
    } as Appointment;
    const [due] = dueReminders(data({ routines: [], appointments: [appt] }), at('2026-10-11T08:02:00Z'));
    expect(reminderMessage(due, 'en', data()).actions).toBeUndefined();
    const afterFeed: Routine = { ...bath, id: 'af', rule: { kind: 'afterLast', hours: 3, logType: 'feed' } };
    const feed = log({ type: 'feed', data: { method: 'bottle', ml: 90, milk: 'formula' }, start: '2026-10-11T04:00:00.000Z' });
    const [auto] = dueReminders(data({ routines: [afterFeed], logs: [feed] }), at('2026-10-11T07:02:00Z'));
    expect(auto.routineId).toBeUndefined();
    expect(reminderMessage(auto, 'en', data()).data).toBeUndefined();
    expect(parseReminderKey('appointment:ap:A:2026-10-11T08:00:00.000Z')).toBeNull();
  });

  it('sends a snoozed reminder again once at its time, not before, replacing the first one', () => {
    const until = '2026-10-11T07:20:00.000Z';
    const family = data({ snoozes: [snooze(until)], done: [] });
    const notYet = dueReminders(family, at('2026-10-11T07:19:00Z')).filter((d) => d.key.startsWith('snooze:'));
    expect(notYet).toEqual([]);
    const again = dueReminders(family, at('2026-10-11T07:21:00Z')).filter((d) => d.key.startsWith('snooze:'));
    expect(again.map((d) => [d.key, d.kind, d.at.toISOString(), d.babies])).toEqual([
      [`snooze:${key}:${until}`, 'medicines', until, 'both'],
    ]);
    const message = reminderMessage(again[0], 'en', data());
    expect(message.tag).toBe(`reminder:${key}`);
    expect(message.data).toMatchObject({ key, occurrence: nine });
    // Long after (outside the window), and a deleted snooze: nothing.
    expect(dueReminders(family, at('2026-10-11T08:00:00Z')).filter((d) => d.key.startsWith('snooze:'))).toEqual([]);
    const cancelled = data({ snoozes: [snooze(until, { deletedAt: 'x' })] });
    expect(dueReminders(cancelled, at('2026-10-11T07:21:00Z')).filter((d) => d.key.startsWith('snooze:'))).toEqual([]);
  });

  it('sounds again: the repeat replaces the first notification but asks the phone to notify', () => {
    const [again] = dueReminders(data({ snoozes: [snooze('2026-10-11T07:20:00.000Z')] }), at('2026-10-11T07:21:00Z')).filter((d) =>
      d.key.startsWith('snooze:'),
    );
    expect(reminderMessage(again, 'en', data()).renotify).toBe(true);
    const [first] = dueReminders(data(), at('2026-10-11T07:04:00Z'));
    expect(reminderMessage(first, 'en', data()).renotify).toBeUndefined();
  });

  it('checks the dose in the family’s own time zone (New York, not the server’s)', () => {
    const ny = settings({ timeZone: 'America/New_York' });
    // 09:00 in New York on 11 October = 13:00 UTC.
    const nyKey = 'routine:vitd:both:2026-10-11T13:00:00.000Z';
    const s = snooze('2026-10-11T13:20:00.000Z', { reminderKey: nyKey, id: `snooze-${nyKey}` });
    const dose = (babyId: string) => log({ type: 'med', babyId, data: { name: 'Vitamin D', dose: '' }, start: '2026-10-11T13:10:00.000Z' });
    const sent = (logs: LogEntry[]) =>
      dueReminders(data({ settings: ny, snoozes: [s], logs }), at('2026-10-11T13:21:00Z')).filter((d) => d.key.startsWith('snooze:'));
    expect(sent([dose('baby-A')])).toHaveLength(1);
    expect(sent([dose('baby-A'), dose('baby-B')])).toEqual([]);
  });

  it('ignores a snooze for an occurrence done or given meanwhile, or a routine that is gone or paused', () => {
    const until = '2026-10-11T07:20:00.000Z';
    const now = at('2026-10-11T07:21:00Z');
    const snoozed = (over: Partial<FamilyData>) =>
      dueReminders(data({ snoozes: [snooze(until)], ...over }), now).filter((d) => d.key.startsWith('snooze:'));
    const done: RoutineDone = { ...meta, id: 'done-vitd', routineId: 'vitd', occurrence: nine };
    expect(snoozed({ done: [done] })).toEqual([]);
    const both = ['baby-A', 'baby-B'].map((babyId) =>
      log({ type: 'med', babyId, data: { name: 'Vitamin D', dose: '' }, start: '2026-10-11T07:10:00.000Z' }),
    );
    expect(snoozed({ logs: both })).toEqual([]);
    // Only one twin had it: still sent.
    expect(snoozed({ logs: both.slice(0, 1) })).toHaveLength(1);
    expect(snoozed({ routines: [{ ...vitD, active: false }] })).toEqual([]);
    expect(snoozed({ routines: [] })).toEqual([]);
  });
});

describe('recipients', () => {
  const subs = [
    { endpoint: 'mom', caregiverId: 'p1', kinds: ['routines', 'medicines'] as const, lang: 'mk' as const },
    { endpoint: 'dad', caregiverId: 'p2', kinds: ['routines', 'medicines', 'feedDue'] as const, lang: 'mk' as const },
    { endpoint: 'baba', caregiverId: 'h1', kinds: ['medicines'] as const, lang: 'mk' as const },
  ].map((s) => ({ ...s, kinds: [...s.kinds] }));
  const night = settings({ nightShifts: [{ caregiverId: 'p2', from: '22:00', to: '06:00' }] });

  it('sends each kind to the phones that want it', () => {
    expect(recipientsFor(subs, 'feedDue', settings(), at('2026-10-11T10:00:00Z')).map((s) => s.endpoint)).toEqual(['dad']);
    expect(recipientsFor(subs, 'medicines', night, at('2026-10-11T10:00:00Z')).map((s) => s.endpoint)).toEqual(['mom', 'dad', 'baba']);
  });

  it('at night sends only to whoever is on duty, or to everyone if they have no subscribed phone', () => {
    // 01:00 UTC = 03:00 in Skopje: Dad's shift.
    expect(recipientsFor(subs, 'medicines', night, at('2026-10-11T01:00:00Z')).map((s) => s.endpoint)).toEqual(['dad']);
    const helperNight = settings({ nightShifts: [{ caregiverId: 'h2', from: '22:00', to: '06:00' }] });
    expect(recipientsFor(subs, 'routines', helperNight, at('2026-10-11T01:00:00Z')).map((s) => s.endpoint)).toEqual(['mom', 'dad']);
  });
});
