import { createInstance } from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en';
import mk from '@/i18n/locales/mk';
import { openDexieStore } from '@/data/dexieStore';
import { DEFAULT_SETTINGS } from '@/data/defaults';
import { exportBackup, importBackup, parseBackup } from '@/data/backup';
import type { AppliedChange } from '@/data/sync/types';
import type { MotherLog, Pump } from '@/data/types';
import { changeLine, fromOtherPhone, type ChangeTextHelpers } from '@/features/sync/changes';
import { recordFields } from '@/features/activity/logic';
import {
  checkinDate,
  checkinId,
  checkins,
  motherMedsBetween,
  motherMedsByDay,
  parseSleepHours,
  pumpingByDay,
  saveCheckin,
  withoutMotherLogs,
} from './logic';

const meta = { createdAt: '', updatedAt: '', deletedAt: null, deviceId: 'other-phone' };
const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const med = (id: string, start: string, over: Partial<MotherLog> = {}): MotherLog =>
  ({ ...meta, id, type: 'med', start, data: { name: 'Ibuprofen', dose: '400 mg' }, loggedBy: 'p2', ...over }) as MotherLog;

describe('the daily check-in', () => {
  it('has one fixed id per day', () => {
    expect(checkinId('2026-10-13')).toBe('checkin-2026-10-13');
  });

  it('replaces the day’s check-in when saved again, and revives a deleted one', async () => {
    const store = await openDexieStore({ name: 'mother-checkin' });
    await saveCheckin(store.motherLogs, '2026-10-13', { mood: 2, sleepHours: 4, note: '' }, 'p1');
    await saveCheckin(store.motherLogs, '2026-10-13', { mood: 4, sleepHours: 5.5, note: 'better' }, 'p2');
    let all = await store.motherLogs.listAll();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 'checkin-2026-10-13', type: 'checkin', data: { mood: 4, sleepHours: 5.5, note: 'better' } });
    expect(checkinDate(all[0])).toBe('2026-10-13');

    await store.motherLogs.remove('checkin-2026-10-13');
    await saveCheckin(store.motherLogs, '2026-10-13', { mood: 3, sleepHours: null, note: '' }, 'p1');
    all = await store.motherLogs.listAll();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ deletedAt: null, data: { mood: 3 } });
  });

  it('stays one record when both phones check in for the same day', async () => {
    const phone1 = await openDexieStore({ name: 'mother-two-1' });
    const phone2 = await openDexieStore({ name: 'mother-two-2' });
    await saveCheckin(phone1.motherLogs, '2026-10-13', { mood: 2, sleepHours: null, note: '' }, 'p1');
    await new Promise((r) => setTimeout(r, 5));
    await saveCheckin(phone2.motherLogs, '2026-10-13', { mood: 4, sleepHours: 6, note: '' }, 'p2');
    await importBackup(phone1, parseBackup(JSON.stringify(await exportBackup(phone2))));
    const merged = await phone1.motherLogs.list();
    expect(merged).toHaveLength(1);
    expect(merged[0].data).toEqual({ mood: 4, sleepHours: 6, note: '' });
  });

  it('reads sleep hours as typed, to the half hour', () => {
    expect(parseSleepHours('')).toBeNull();
    expect(parseSleepHours('5,5')).toBe(5.5);
    expect(parseSleepHours('6.2')).toBe(6);
    expect(parseSleepHours('25')).toBe('invalid');
    expect(parseSleepHours('a lot')).toBe('invalid');
  });

  it('lists check-ins by their day, newest first, without deleted ones', () => {
    const c = (date: string, deletedAt: string | null = null) =>
      ({
        ...meta,
        id: checkinId(date),
        type: 'checkin',
        start: local(1, 12),
        data: { mood: 3, sleepHours: null, note: '' },
        loggedBy: 'p1',
        deletedAt,
      }) as MotherLog;
    expect(checkins([c('2026-10-11'), c('2026-10-13'), c('2026-10-12', 'x'), med('m', local(13, 8))]).map(checkinDate)).toEqual([
      '2026-10-13',
      '2026-10-11',
    ]);
  });
});

describe('her medicines and pumping', () => {
  it('groups her doses per day, midnight belonging to the new day', () => {
    const logs = [
      med('a', local(12, 23, 59)),
      med('b', local(13, 0, 0)),
      med('c', local(13, 8)),
      med('d', local(13, 9), { deletedAt: 'x' }),
    ];
    const days = motherMedsByDay(logs, ['2026-10-12', '2026-10-13']);
    expect(days.map((d) => [d.date, d.doses.map((x) => x.id)])).toEqual([
      ['2026-10-13', ['b', 'c']],
      ['2026-10-12', ['a']],
    ]);
    expect(motherMedsBetween(logs, new Date(2026, 9, 13), new Date(2026, 9, 14)).map((x) => x.id)).toEqual(['b', 'c']);
  });

  it('sums finished pumping sessions per day, leaving a running timer out', () => {
    const pump = (id: string, start: string, totalMl: number, end?: string | null): Pump =>
      ({ ...meta, id, start, end, side: null, minutes: 10, leftMl: null, rightMl: null, totalMl, loggedBy: 'p1' }) as Pump;
    const rows = pumpingByDay(
      [pump('a', local(13, 8), 90), pump('b', local(13, 12), 60), pump('c', local(13, 14), 0, null)],
      ['2026-10-12', '2026-10-13'],
    );
    expect(rows).toEqual([
      { date: '2026-10-13', sessions: 2, ml: 150 },
      { date: '2026-10-12', sessions: 0, ml: 0 },
    ]);
  });
});

describe('privacy', () => {
  const i18n = createInstance();
  let h: ChangeTextHelpers;
  beforeAll(async () => {
    await i18n.init({ resources: { en: { translation: en }, mk: { translation: mk } }, lng: 'en', interpolation: { escapeValue: false } });
    h = {
      t: (key, options) => (i18n.t as unknown as (k: string, o?: object) => string)(key, options),
      entry: () => ({ title: '', detail: '' }),
      twin: () => '',
      label: (r) => r.name,
      routineTitle: () => undefined,
      when: () => '13 Oct 08:00',
      day: (d) => d,
      parentName: () => 'Marija',
      caregiverIds: ['p1', 'p2'],
    };
  });

  const checkin = {
    ...meta,
    id: 'checkin-2026-10-13',
    type: 'checkin',
    start: local(13, 12),
    data: { mood: 1, sleepHours: 3, note: 'hard night' },
    loggedBy: 'p2',
  } as MotherLog;
  const added = (record: MotherLog): AppliedChange => ({ collection: 'motherLogs', record, previous: undefined });
  const feed: AppliedChange = { collection: 'tasks', record: { ...meta, id: 't' }, previous: undefined };

  it('does not announce her entries unless the family turned it on', () => {
    const news = fromOtherPhone([added(checkin), added(med('m', local(13, 8))), feed], 'my-phone');
    expect(withoutMotherLogs(news, false).map((c) => c.collection)).toEqual(['tasks']);
    expect(withoutMotherLogs(news, true)).toHaveLength(3);
  });

  it('never puts the mood, sleep or note in a message', () => {
    const line = changeLine(added(checkin), h);
    expect(line).toBe('Mother’s check-in (2026-10-13)');
    expect(changeLine(added(med('m', local(13, 8))), h)).toBe('Mother: Ibuprofen (13 Oct 08:00)');
    expect(changeLine({ collection: 'motherLogs', record: { ...checkin, deletedAt: 'x' }, previous: checkin }, h)).toBe(
      'Mother’s check-in deleted',
    );
  });

  it('keeps the check-in’s fields out of the notification history details', () => {
    expect([...recordFields(checkin).keys()]).toEqual(['type', 'start', 'loggedBy']);
    expect(recordFields(med('m', local(13, 8))).get('data.name')).toBe('Ibuprofen');
  });
});

describe('backup', () => {
  it('round-trips her entries to the other phone, including a deleted one', async () => {
    const phone1 = await openDexieStore({ name: 'mother-backup-1' });
    const phone2 = await openDexieStore({ name: 'mother-backup-2' });
    const dose = await phone1.motherLogs.create({
      type: 'med',
      start: local(13, 8),
      data: { name: 'Ibuprofen', dose: '' },
      loggedBy: 'p1',
    });
    const note = await phone1.motherLogs.create({ type: 'note', start: local(13, 9), data: { text: 'x' }, loggedBy: 'p1' });
    await phone1.motherLogs.remove(note.id);
    await importBackup(phone2, parseBackup(JSON.stringify(await exportBackup(phone1))));
    expect(await phone2.motherLogs.list()).toEqual([dose]);
    expect((await phone2.motherLogs.listAll()).find((m) => m.id === note.id)?.deletedAt).not.toBeNull();
  });
});

describe('shared settings for the mother', () => {
  it('keep her entries quiet and show her medicines on Today by default (also for older settings records)', () => {
    expect(DEFAULT_SETTINGS.announceMother).toBe(false);
    expect(DEFAULT_SETTINGS.motherCard).toBe(true);
  });

  it('give an older settings record the defaults', async () => {
    const store = await openDexieStore({ name: 'mother-settings' });
    const settings = await store.settings.get();
    expect([settings.announceMother, settings.motherCard]).toEqual([false, true]);
  });
});
