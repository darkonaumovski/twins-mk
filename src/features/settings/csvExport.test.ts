import { createInstance } from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en';
import mk from '@/i18n/locales/mk';
import type { Baby, Category, Contraction, Entity, LogEntry, Milestone, MilkStashItem, PrepItem, Pump, Vaccine } from '@/data/types';
import { toCsv } from '@/lib/csv';
import { scopeLabelKey } from '@/features/plan/logic';
import { buildCsvFiles, csvZipName, text, type CsvData, type CsvText } from './csvExport';

const i18n = createInstance();
let tx: CsvText;

beforeAll(async () => {
  await i18n.init({ resources: { en: { translation: en }, mk: { translation: mk } }, lng: 'en', interpolation: { escapeValue: false } });
  const t = (key: string, options?: Record<string, unknown>) => (i18n.t as unknown as (k: string, o?: object) => string)(key, options);
  const twin = (id: string) => (id === 'baby-A' || id === 'A' ? 'Ема' : 'Ана');
  tx = {
    t,
    twin,
    person: (id) => (id === 'p1' ? 'Марија' : id === 'p2' ? 'Дарко' : 'Баба'),
    label: (r) => r.name,
    scope: (scope, kind) => {
      const key = scopeLabelKey(scope, kind);
      return key ? t(key) : twin(scope);
    },
  };
});

const meta = (id: string, deletedAt: string | null = null): Entity => ({ id, createdAt: '', updatedAt: '', deletedAt, deviceId: 'd' });
const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const log = (id: string, e: Partial<LogEntry> & Pick<LogEntry, 'type' | 'data'>): LogEntry =>
  ({ ...meta(id), babyId: 'baby-A', start: local(11, 9), end: null, groupId: null, loggedBy: 'p1', ...e }) as LogEntry;

const empty: CsvData = {
  logs: [],
  pumps: [],
  milkStash: [],
  appointments: [],
  tasks: [],
  milestones: [],
  prepItems: [],
  categories: [],
  contractions: [],
  vaccines: [],
  motherLogs: [],
  babies: [],
};
const file = (data: Partial<CsvData>, name: string) => buildCsvFiles({ ...empty, ...data }, tx).find((f) => f.fileName === name)!;

describe('spreadsheet export', () => {
  it('writes every file with only its header when there is no data', () => {
    const files = buildCsvFiles(empty, tx);
    expect(files.map((f) => f.fileName)).toEqual([
      'logs.csv',
      'pumping.csv',
      'milk-stash.csv',
      'appointments.csv',
      'tasks.csv',
      'milestones.csv',
      'checklist.csv',
      'contractions.csv',
      'vaccines.csv',
      'mother.csv',
    ]);
    for (const f of files) expect(f.rows).toHaveLength(1);
    expect(files[0].rows[0].slice(0, 4)).toEqual(['Date', 'Time', 'Twin', 'Type']);
  });

  it('writes headers in the phone’s language', async () => {
    await i18n.changeLanguage('mk');
    try {
      expect(file({}, 'logs.csv').rows[0].slice(0, 4)).toEqual(['Датум', 'Време', 'Близнак', 'Вид']);
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  it('flattens log entries: names instead of ids, local date and time, per-type columns', () => {
    const rows = file(
      {
        logs: [
          log('b', { type: 'feed', data: { method: 'bottle', ml: 90, milk: 'formula' }, babyId: 'baby-B', loggedBy: 'p2' }),
          log('br', {
            type: 'feed',
            data: { method: 'breast', side: 'left', topUp: { ml: 30, milk: 'breast' } },
            start: local(11, 7),
            end: local(11, 7, 25),
          }),
          log('s', { type: 'sleep', data: {}, start: local(10, 23, 30), end: local(11, 2) }),
          log('t', { type: 'temp', data: { celsius: 37.8 }, start: local(11, 10) }),
          log('m', { type: 'measure', data: { weightG: 3120, lengthCm: 50.5 }, start: local(11, 11) }),
          log('d', { type: 'diaper', data: { kind: 'both' }, start: local(11, 12) }),
          log('gone', { type: 'diaper', data: { kind: 'wet' }, start: local(11, 13), deletedAt: 'x' }),
          { ...log('new', { type: 'diaper', data: { kind: 'wet' }, start: local(11, 14) }), type: 'solids' } as unknown as LogEntry,
        ],
      },
      'logs.csv',
    ).rows;
    const head = rows[0];
    const col = (row: unknown[], name: string) => row[head.indexOf(name)];
    // Oldest first; the deleted entry and the type this version does not know are left out.
    expect(rows.slice(1).map((r) => col(r, 'Type'))).toEqual(['Sleep', 'Feed', 'Feed', 'Temperature', 'Measure', 'Diaper']);
    const [sleep, breast, bottle, temp, measure, diaper] = rows.slice(1);
    expect([col(sleep, 'Date'), col(sleep, 'Time'), col(sleep, 'Sleep (min)')]).toEqual(['2026-10-10', '23:30', 150]);
    expect([col(breast, 'Method'), col(breast, 'Side'), col(breast, 'Top-up (ml)'), col(breast, 'Milk'), col(breast, 'Minutes')]).toEqual([
      'Breast',
      'Left',
      30,
      'Breast milk',
      25,
    ]);
    expect([col(bottle, 'Twin'), col(bottle, 'ml'), col(bottle, 'Milk'), col(bottle, 'Logged by')]).toEqual([
      'Ана',
      90,
      'Formula',
      'Дарко',
    ]);
    expect(col(temp, 'Temperature (°C)')).toBe(37.8);
    expect([col(measure, 'Weight (g)'), col(measure, 'Length (cm)'), col(measure, 'Head (cm)')]).toEqual([3120, 50.5, undefined]);
    expect(col(diaper, 'Diaper')).toBe('Wet + dirty');
    // Each row has as many cells as the header.
    for (const r of rows) expect(r).toHaveLength(head.length);
  });

  it('reads optional fields from newer versions when they are there (rash, head size)', () => {
    const rows = file(
      {
        logs: [
          log('d', { type: 'diaper', data: { kind: 'dirty', rash: true, color: 'green', texture: 'soft' } }),
          log('m', { type: 'measure', data: { weightG: null, lengthCm: null, headCm: 35.2 } as never }),
        ],
      },
      'logs.csv',
    ).rows;
    const head = rows[0];
    expect(rows[1][head.indexOf('Rash')]).toBe('Yes');
    expect(rows[1][head.indexOf('Stool colour')]).toBe('Green');
    expect(rows[1][head.indexOf('Stool texture')]).toBe('Soft');
    expect(rows[2][head.indexOf('Head (cm)')]).toBe(35.2);
  });

  it('escapes commas, quotes and line breaks in notes, and keeps Cyrillic', () => {
    const note = 'Јаде, „мирно“ и "добро"\nвтор ред';
    const csv = toCsv(file({ logs: [log('n', { type: 'note', data: { text: note } })] }, 'logs.csv').rows);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Јаде, „мирно“ и ""добро""\nвтор ред"');
    expect(csv.split('\r\n')).toHaveLength(3); // header, one row, trailing line end
  });

  it('guards names and notes in the files themselves, not only in the helper', () => {
    const named: CsvText = { ...tx, twin: () => '=Ема', person: () => '+Баба' };
    const rows = buildCsvFiles({ ...empty, logs: [log('n', { type: 'note', data: { text: '=1+1' } })] }, named)[0].rows;
    const head = rows[0];
    expect([rows[1][head.indexOf('Twin')], rows[1][head.indexOf('Note')], rows[1][head.indexOf('Logged by')]]).toEqual([
      "'=Ема",
      "'=1+1",
      "'+Баба",
    ]);
  });

  it('covers the other entry types, running timers and a damaged timestamp', () => {
    const rows = file(
      {
        logs: [
          log('med', { type: 'med', data: { name: 'Vitamin D', dose: '1 drop' }, start: local(11, 8) }),
          log('sp', { type: 'spitup', data: { size: 'large' }, start: local(11, 8, 10) }),
          log('tu', { type: 'tummy', data: { minutes: 10 }, start: local(11, 8, 20) }),
          log('ba', { type: 'bath', data: {}, start: local(11, 8, 30) }),
          log('br', { type: 'feed', data: { method: 'breast', side: 'both' }, start: local(11, 8, 40), end: null }),
          log('sl', { type: 'sleep', data: {}, start: local(11, 8, 50), end: null }),
          log('bad', { type: 'bath', data: {}, start: 'not a date' }),
        ],
      },
      'logs.csv',
    ).rows;
    const head = rows[0];
    const pick = (r: unknown[], ...names: string[]) => names.map((n) => r[head.indexOf(n)]);
    const byType = (type: string) => rows.slice(1).filter((r) => r[head.indexOf('Type')] === type);
    expect(pick(byType('Medicine')[0], 'Medicine', 'Dose')).toEqual(['Vitamin D', '1 drop']);
    expect(pick(byType('Spit-up')[0], 'Size')).toEqual(['Large']);
    expect(pick(byType('Tummy time')[0], 'Minutes')).toEqual([10]);
    expect(pick(byType('Feed')[0], 'Side', 'Minutes', 'Top-up (ml)')).toEqual(['Both sides', 'running', undefined]);
    expect(pick(byType('Sleep')[0], 'Sleep (min)')).toEqual(['running']);
    // A damaged record still exports, with empty date and time.
    expect(byType('Bath').map((r) => pick(r, 'Date', 'Time'))).toContainEqual(['', '']);
  });

  it('writes checklist tasks, items whose category is gone, and twins without birth details', () => {
    const base: PrepItem = {
      ...meta('i'),
      kind: 'task',
      name: 'Pack the bag',
      seedKey: null,
      categoryId: 'gone',
      scope: 'shared',
      quantity: 1,
      acquired: 0,
      priority: 'must',
      status: 'needed',
      estimatedUnitPrice: null,
      actualPrice: null,
      store: '',
      link: '',
      notes: '',
      neededBy: null,
      done: true,
      order: 1,
    };
    expect(file({ prepItems: [base] }, 'checklist.csv').rows[1]).toEqual(['', 'Pack the bag', '', '', '', 'Yes', null, null, '']);
    const baby: Baby = {
      ...meta('baby-B'),
      slot: 'B',
      name: 'Ана',
      color: 'amber',
      birthDateTime: null,
      birthWeightG: null,
      birthLengthCm: null,
    };
    const m: Milestone = { ...meta('m'), babyId: 'baby-B', key: null, title: 'First bath', date: '2026-10-11', note: '' };
    expect(file({ milestones: [m], babies: [baby] }, 'milestones.csv').rows[1]).toEqual([
      'Ана',
      'First bath',
      '2026-10-11',
      undefined,
      undefined,
      '',
    ]);
  });

  it('keeps text that looks like a formula from being run by Excel', () => {
    expect(text('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(text('-ate well')).toBe("'-ate well");
    expect(text('+50 ml')).toBe("'+50 ml");
    expect(text('ate well')).toBe('ate well');
    expect(text(null)).toBe('');
  });

  it('leaves a running pumping timer out, and writes the stash with its place', () => {
    const pump = (id: string, over: Partial<Pump>): Pump => ({
      ...meta(id),
      start: local(11, 6),
      minutes: 15,
      leftMl: 60,
      rightMl: 50,
      totalMl: 110,
      loggedBy: 'p1',
      ...over,
    });
    const pumping = file({ pumps: [pump('old', {}), pump('run', { end: null, minutes: null, totalMl: 0 })] }, 'pumping.csv').rows;
    expect(pumping.slice(1)).toEqual([['2026-10-11', '06:00', 15, 60, 50, 110, 'Марија']]);
    const stash: MilkStashItem = { ...meta('s'), pumpedAt: local(11, 6), ml: 110, location: 'freezer', usedAt: null, pumpId: 'old' };
    expect(file({ milkStash: [stash] }, 'milk-stash.csv').rows[1]).toEqual(['2026-10-11', '06:00', 110, 'Freezer', '']);
  });

  it('gives milestones the age and the corrected age on that day', () => {
    const baby: Baby = {
      ...meta('baby-A'),
      slot: 'A',
      name: 'Ема',
      color: 'teal',
      birthDateTime: new Date(2026, 8, 1, 10).toISOString(),
      birthWeightG: 2400,
      birthLengthCm: 46,
      gestationWeeksAtBirth: 35,
      gestationDaysAtBirth: 4,
    };
    const smile: Milestone = { ...meta('m'), babyId: 'baby-A', key: 'smile', title: '', date: '2026-10-11', note: '' };
    const undated: Milestone = { ...smile, id: 'u', date: null };
    const rows = file({ milestones: [smile, undated], babies: [baby] }, 'milestones.csv').rows;
    // Born 1 Sep at 35+4: 40 days old, 40 − (280 − 249) = 9 days corrected.
    expect(rows.slice(1)).toEqual([['Ема', en.milestones.keys.smile, '2026-10-11', 40, 9, '']]);
  });

  it('writes appointments, tasks and the checklist in words', () => {
    const appts = file(
      {
        appointments: [
          { ...meta('a'), title: 'Ultrasound', babies: 'none', start: local(12, 10, 30), location: 'Clinic, room 3', notes: '' },
        ],
      },
      'appointments.csv',
    ).rows;
    expect(appts[1]).toEqual(['2026-10-12', '10:30', 'Ultrasound', 'Pregnancy / mother', 'Clinic, room 3', '']);

    const tasks = file(
      { tasks: [{ ...meta('t'), title: 'Pack the bag', assignee: 'p2', due: '2026-10-20', done: false, notes: '' }] },
      'tasks.csv',
    ).rows;
    expect(tasks[1]).toEqual(['Pack the bag', 'Дарко', '2026-10-20', 'No', '']);

    const cat: Category = { ...meta('c'), name: 'Sleep', seedKey: null, order: 1 };
    const item: PrepItem = {
      ...meta('i'),
      kind: 'item',
      name: 'Cot',
      seedKey: null,
      categoryId: 'c',
      scope: 'perBaby',
      quantity: 2,
      acquired: 1,
      priority: 'must',
      status: 'ordered',
      estimatedUnitPrice: 4500.5,
      actualPrice: null,
      store: 'Store',
      link: '',
      notes: '',
      neededBy: null,
      done: false,
      order: 1,
    };
    const checklist = file({ prepItems: [item, { ...item, id: 'x', deletedAt: 'y' }], categories: [cat] }, 'checklist.csv').rows;
    expect(checklist.slice(1)).toEqual([['Sleep', 'Cot', 'Per twin', 2, 1, 'Ordered', 4500.5, null, 'Store']]);
  });

  it('lists contractions oldest first with lengths and intervals in seconds', () => {
    const c = (id: string, start: string, end: string | null): Contraction => ({ ...meta(id), start, end });
    const rows = file(
      {
        contractions: [
          c('b', new Date(2026, 9, 11, 10, 6).toISOString(), null),
          c('a', local(11, 10), new Date(2026, 9, 11, 10, 1, 5).toISOString()),
        ],
      },
      'contractions.csv',
    ).rows;
    expect(rows.slice(1)).toEqual([
      ['2026-10-11', '10:00:00', 65, null],
      ['2026-10-11', '10:06:00', null, 360],
    ]);
  });

  it('lists vaccinations oldest first with names, dose and lot, leaving deleted ones out', () => {
    const v = (id: string, babyId: string, date: string, over: Partial<Vaccine> = {}): Vaccine => ({
      ...meta(id),
      babyId,
      name: 'Hexa',
      dose: 2,
      date,
      place: 'Health centre, room 3',
      lot: 'AB12',
      notes: '',
      groupId: 'g',
      ...over,
    });
    const rows = file(
      {
        vaccines: [
          v('b', 'baby-B', '2026-10-01'),
          v('a', 'baby-A', '2026-10-01', { notes: '-fever in the evening' }),
          v('old', 'baby-A', '2026-08-01', { name: 'BCG', dose: null, place: '', lot: '' }),
          v('gone', 'baby-A', '2026-09-01', { deletedAt: 'x' }),
        ],
      },
      'vaccines.csv',
    ).rows;
    expect(rows[0]).toEqual(['Twin', 'Date', 'Vaccine', 'Dose', 'Where', 'Batch / lot', 'Reactions or notes']);
    expect(rows.slice(1)).toEqual([
      ['Ема', '2026-08-01', 'BCG', null, '', '', ''],
      ['Ема', '2026-10-01', 'Hexa', 2, 'Health centre, room 3', 'AB12', "'-fever in the evening"],
      ['Ана', '2026-10-01', 'Hexa', 2, 'Health centre, room 3', 'AB12', ''],
    ]);
  });

  it('writes the mother’s medicines, check-ins (by their day) and notes, oldest first', () => {
    const rows = file(
      {
        motherLogs: [
          { ...meta('n'), type: 'note', start: local(13, 9), data: { text: '-tired' }, loggedBy: 'p1' },
          { ...meta('m'), type: 'med', start: local(12, 20, 5), data: { name: 'Ibuprofen', dose: '400 mg' }, loggedBy: 'p2' },
          {
            ...meta('checkin-2026-10-13'),
            type: 'checkin',
            start: new Date(2026, 9, 13, 12).toISOString(),
            data: { mood: 4, sleepHours: 5.5, note: '' },
            loggedBy: 'p1',
          },
          { ...meta('x', 'deleted'), type: 'note', start: local(13, 10), data: { text: 'gone' }, loggedBy: 'p1' },
        ],
      },
      'mother.csv',
    ).rows;
    expect(rows[0]).toEqual(['Date', 'Time', 'Type', 'Medicine', 'Dose', 'Mood (1–5)', 'Sleep (hours)', 'Note', 'Logged by']);
    expect(rows.slice(1)).toEqual([
      ['2026-10-12', '20:05', 'Medicine', 'Ibuprofen', '400 mg', null, null, '', 'Дарко'],
      ['2026-10-13', '09:00', 'Note', '', '', null, null, "'-tired", 'Марија'],
      ['2026-10-13', '', 'Check-in', '', '', 4, 5.5, '', 'Марија'],
    ]);
  });

  it('names the zip after the day', () => {
    expect(csvZipName(new Date(2026, 9, 12, 23, 59))).toBe('twins-organizer-2026-10-12.zip');
  });
});
