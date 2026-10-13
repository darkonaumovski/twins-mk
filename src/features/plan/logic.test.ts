import { describe, expect, it } from 'vitest';
import type { Appointment, ParentTask, Routine, RoutineDone } from '@/data/types';
import {
  scopeLabelKey,
  dailyCareStatus,
  effectiveScope,
  medCheck,
  motherCareStatus,
  MOTHER_ID,
  reminderTime,
  sameMed,
  scheduledOccurrences,
  sortTasks,
  toMedLogs,
  upcomingItems,
  type MedLog,
  type UpcomingInput,
} from './logic';

const meta = { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '', deletedAt: null, deviceId: 'd' };
const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);

const bath: Routine = {
  ...meta,
  id: 'bath',
  title: 'Bath',
  babies: 'both',
  active: true,
  rule: { kind: 'everyDays', days: 2, times: ['19:00'], startDate: '2026-10-10' },
};
const feed: Routine = {
  ...meta,
  id: 'feed',
  title: 'Feed',
  babies: 'both',
  active: true,
  rule: { kind: 'afterLast', hours: 3, logType: 'feed' },
};

describe('scheduledOccurrences', () => {
  it('repeats every N days from the start date at the given times', () => {
    const days = scheduledOccurrences(bath, local(9, 0), local(16, 0)).map((d) => d.getDate());
    expect(days).toEqual([10, 12, 14]);
  });

  it('supports several times a day and respects the window edges', () => {
    const vitamins = { ...bath, rule: { kind: 'everyDays' as const, days: 1, times: ['20:00', '08:00'], startDate: '2026-10-01' } };
    const result = scheduledOccurrences(vitamins, local(11, 9), local(12, 9));
    expect(result).toEqual([local(11, 20), local(12, 8)]);
  });

  it('returns nothing for inactive routines', () => {
    expect(scheduledOccurrences({ ...bath, active: false }, local(9, 0), local(16, 0))).toEqual([]);
  });
});

const base = (over: Partial<UpcomingInput> = {}): UpcomingInput => ({
  routines: [],
  done: [],
  latest: {},
  appointments: [],
  tasks: [],
  now: local(12, 18),
  pastMs: 12 * 3600_000,
  aheadMs: 12 * 3600_000,
  ...over,
});

describe('upcomingItems', () => {
  it('lists a scheduled occurrence until it is marked done', () => {
    expect(upcomingItems(base({ routines: [bath] })).map((i) => i.at)).toEqual([local(12, 19)]);
    const done: RoutineDone = { ...meta, id: 'x', routineId: 'bath', occurrence: local(12, 19).toISOString() };
    expect(upcomingItems(base({ routines: [bath], done: [done] }))).toEqual([]);
  });

  it('counts "after the last" routines per twin from their own latest entry', () => {
    const items = upcomingItems(
      base({ routines: [feed], latest: { A: { feed: local(12, 16).toISOString() }, B: { feed: local(12, 14).toISOString() } } }),
    );
    expect(items.map((i) => [i.babies, i.at, i.auto])).toEqual([
      ['B', local(12, 17), true],
      ['A', local(12, 19), true],
    ]);
  });

  it('skips "after the last" routines when nothing has been logged yet', () => {
    expect(upcomingItems(base({ routines: [feed] }))).toEqual([]);
  });

  it('includes appointments in the window and open tasks due today or earlier', () => {
    const appt: Appointment = {
      ...meta,
      id: 'a',
      title: 'Check-up',
      babies: 'both',
      start: local(13, 9).toISOString(),
      location: 'Clinic',
      notes: '',
    };
    const far: Appointment = { ...appt, id: 'far', start: local(20, 9).toISOString() };
    const task = (id: string, due: string | null, done = false): ParentTask => ({
      ...meta,
      id,
      title: id,
      assignee: null,
      due,
      done,
      notes: '',
    });
    const items = upcomingItems(
      base({
        appointmentAheadMs: 48 * 3600_000,
        appointments: [appt, far],
        tasks: [
          task('late', '2026-10-10'),
          task('today', '2026-10-12'),
          task('later', '2026-10-20'),
          task('done', '2026-10-01', true),
          task('undated', null),
        ],
      }),
    );
    expect(items.map((i) => i.id)).toEqual(['a', 'late', 'today']);
  });
});

describe('reminderTime', () => {
  it('reminds an hour before appointments and on time for routines', () => {
    expect(reminderTime({ key: '', kind: 'appointment', id: '', title: '', babies: 'none', at: local(13, 9) })).toEqual(local(13, 8));
    expect(reminderTime({ key: '', kind: 'routine', id: '', title: '', babies: 'none', at: local(13, 9) })).toEqual(local(13, 9));
    expect(reminderTime({ key: '', kind: 'task', id: '', title: '', babies: 'none', at: null })).toBeNull();
  });
});

describe('sortTasks', () => {
  it('puts open tasks first, by due date, undated after dated, done last', () => {
    const t = (id: string, due: string | null, done = false): ParentTask => ({
      ...meta,
      id,
      title: id,
      assignee: null,
      due,
      done,
      notes: '',
    });
    expect(sortTasks([t('d', null, true), t('c', null), t('b', '2026-10-20'), t('a', '2026-10-01')]).map((x) => x.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });
});

const vitD: Routine = {
  ...meta,
  id: 'vitd',
  title: 'Vitamin D drops',
  babies: 'both',
  active: true,
  rule: { kind: 'everyDays', days: 1, times: ['09:00'], startDate: '2026-10-01' },
  med: { name: 'Vitamin D', dose: '1 drop', minIntervalHours: null },
};
const dose = (babyId: string, at: Date, name = 'vitamin d'): MedLog => ({ babyId, name, start: at.toISOString() });

describe('medicines', () => {
  it('matches medicine names ignoring case and spaces', () => {
    expect(sameMed('Vitamin D', ' vitamin d ')).toBe(true);
    expect(sameMed('Vitamin D', 'Vitamin K')).toBe(false);
  });

  it('shows daily medicine routines per twin with today’s doses', () => {
    const logs = [dose('baby-A', local(11, 9, 5)), dose('baby-A', local(10, 9)), dose('baby-B', local(11, 8), 'Iron')];
    const rows = dailyCareStatus([vitD, bath, { ...vitD, id: 'paused', active: false }], logs, local(11, 0), local(12, 0));
    expect(rows).toHaveLength(1);
    expect(rows[0].cells).toEqual([
      { slot: 'A', given: 1, planned: 1 },
      { slot: 'B', given: 0, planned: 1 },
    ]);
  });

  it('only warns when the parents set a minimum interval', () => {
    const logs = [dose('baby-B', local(11, 9))];
    const now = local(11, 11);
    expect(medCheck(logs, 'B', 'Vitamin D', [vitD], now)).toEqual({
      lastAt: local(11, 9).toISOString(),
      minIntervalHours: null,
      warn: false,
    });

    const withInterval = { ...vitD, med: { ...vitD.med!, minIntervalHours: 20 } };
    expect(medCheck(logs, 'B', 'VITAMIN D', [withInterval], now)).toMatchObject({ minIntervalHours: 20, warn: true });
    expect(medCheck(logs, 'B', 'Vitamin D', [withInterval], local(12, 6))).toMatchObject({ warn: false });
    // The other twin has not had it, and an interval set for twin A only does not apply to B.
    expect(medCheck(logs, 'A', 'Vitamin D', [withInterval], now)).toMatchObject({ lastAt: null, warn: false });
    expect(medCheck(logs, 'B', 'Vitamin D', [{ ...withInterval, babies: 'A' }], now)).toMatchObject({
      minIntervalHours: null,
      warn: false,
    });
  });

  it('marks a medicine routine as done in "Coming up" once each twin was given it that day', () => {
    const base: UpcomingInput = {
      routines: [{ ...vitD, rule: { kind: 'everyDays', days: 1, times: ['09:00', '21:00'], startDate: '2026-10-01' } }],
      done: [],
      latest: {},
      appointments: [],
      tasks: [],
      now: local(11, 12),
      pastMs: 12 * 3600_000,
      aheadMs: 12 * 3600_000,
    };
    const keys = (medLogs: MedLog[]) => upcomingItems({ ...base, medLogs }).map((i) => i.at!.getHours());
    expect(keys([])).toEqual([9, 21]);
    // Only twin A had the morning dose: still open.
    expect(keys([dose('baby-A', local(11, 9))])).toEqual([9, 21]);
    expect(keys([dose('baby-A', local(11, 9)), dose('baby-B', local(11, 10))])).toEqual([21]);
  });

  it('reads medicine doses from log entries', () => {
    const entry = {
      ...meta,
      id: 'm',
      type: 'med',
      babyId: 'baby-A',
      start: 's',
      end: null,
      groupId: null,
      loggedBy: 'p1',
      data: { name: 'D', dose: '' },
    };
    expect(toMedLogs([entry as never, { ...entry, deletedAt: 'x' } as never])).toEqual([{ babyId: 'baby-A', name: 'D', start: 's' }]);
  });
});

describe('twins in hospital', () => {
  it('leaves a twin in hospital out of "only when home" routines', () => {
    const bathHome = { ...bath, onlyWhenHome: true };
    expect(effectiveScope(bathHome, ['A'])).toBe('B');
    expect(effectiveScope(bathHome, ['A', 'B'])).toBeNull();
    expect(effectiveScope(bath, ['A'])).toBe('both');
    expect(effectiveScope({ ...bathHome, babies: 'none' }, ['A', 'B'])).toBe('none');
  });

  it('applies it to coming-up items and daily care', () => {
    const vit = { ...vitD, onlyWhenHome: true };
    const base: UpcomingInput = {
      routines: [vit],
      done: [],
      latest: {},
      appointments: [],
      tasks: [],
      now: local(11, 8),
      pastMs: 0,
      aheadMs: 4 * 3600_000,
    };
    expect(upcomingItems({ ...base, awaySlots: ['B'] }).map((i) => i.babies)).toEqual(['A']);
    expect(upcomingItems({ ...base, awaySlots: ['A', 'B'] })).toEqual([]);
    expect(dailyCareStatus([vit], [], local(11, 0), local(12, 0), ['B'])[0].cells.map((c) => c.slot)).toEqual(['A']);
  });
});

describe('scope labels', () => {
  it('names "none" by the kind of record', () => {
    expect(scopeLabelKey('none', 'appointment')).toBe('plan.pregnancyMother');
    expect(scopeLabelKey('none', 'note')).toBe('notes.forMother');
    expect(scopeLabelKey('none', 'routine')).toBe('plan.family');
    expect(scopeLabelKey('both', 'appointment')).toBe('twins.both');
    expect(scopeLabelKey('A', 'note')).toBeNull();
  });
});

describe('medicines for the mother', () => {
  const ibu: Routine = {
    ...vitD,
    id: 'ibu',
    title: 'Ibuprofen',
    babies: 'none',
    rule: { kind: 'everyDays', days: 1, times: ['08:00', '20:00'], startDate: '2026-10-01' },
    med: { name: 'Ibuprofen', dose: '400 mg', minIntervalHours: 6 },
  };
  const motherDose = (at: Date, name = 'ibuprofen'): MedLog => ({ babyId: MOTHER_ID, name, start: at.toISOString() });

  it('labels the no-twin option of a medicine routine "For the mother"', () => {
    expect(scopeLabelKey('none', 'medRoutine')).toBe('notes.forMother');
    expect(scopeLabelKey('A', 'medRoutine')).toBeNull();
  });

  it('turns the mother’s logged doses into medicine logs of her own', () => {
    const logs = toMedLogs(
      [],
      [
        { ...meta, id: 'm1', type: 'med', start: local(11, 8).toISOString(), data: { name: 'Ibuprofen', dose: '' }, loggedBy: 'p1' },
        { ...meta, id: 'm2', type: 'note', start: local(11, 9).toISOString(), data: { text: 'x' }, loggedBy: 'p1' },
        {
          ...meta,
          id: 'm3',
          type: 'med',
          start: local(11, 10).toISOString(),
          data: { name: 'Ibuprofen', dose: '' },
          loggedBy: 'p1',
          deletedAt: 'x',
        },
      ],
    );
    expect(logs).toEqual([{ babyId: MOTHER_ID, name: 'Ibuprofen', start: local(11, 8).toISOString() }]);
  });

  it('is due and done from her own doses, the second time of the day needing a second dose', () => {
    const input = (medLogs: MedLog[]) => base({ routines: [ibu], medLogs, now: local(11, 21), pastMs: 14 * 3600_000, aheadMs: 60_000 });
    expect(upcomingItems(input([])).map((i) => i.occurrence)).toEqual([local(11, 8).toISOString(), local(11, 20).toISOString()]);
    expect(upcomingItems(input([motherDose(local(11, 8, 5))])).map((i) => i.occurrence)).toEqual([local(11, 20).toISOString()]);
    expect(upcomingItems(input([motherDose(local(11, 8, 5)), motherDose(local(11, 20, 1))]))).toEqual([]);
    // A twin's entry with the same name is not her dose.
    expect(upcomingItems(input([dose('baby-A', local(11, 8, 5), 'ibuprofen')]))).toHaveLength(2);
    expect(upcomingItems(input([]))[0]).toMatchObject({ babies: 'none', med: true });
  });

  it('checks her interval against her own routines only', () => {
    const logs = [motherDose(local(11, 8)), dose('baby-A', local(11, 9), 'ibuprofen')];
    expect(medCheck(logs, 'mother', 'Ibuprofen', [ibu], local(11, 12))).toEqual({
      lastAt: local(11, 8).toISOString(),
      minIntervalHours: 6,
      warn: true,
    });
    expect(medCheck(logs, 'mother', 'Ibuprofen', [ibu], local(11, 14, 1))).toMatchObject({ warn: false });
    // The twin's dose of the same name has no interval from the mother's routine.
    expect(medCheck(logs, 'A', 'Ibuprofen', [ibu], local(11, 9, 30))).toMatchObject({ minIntervalHours: null, warn: false });
  });

  it('shows her daily medicines on her own card, with today’s doses and when last given', () => {
    const logs = [motherDose(local(10, 20)), motherDose(local(11, 8))];
    expect(motherCareStatus([ibu, vitD, { ...ibu, id: 'off', active: false }], logs, local(11, 0), local(12, 0), local(11, 12))).toEqual([
      { routine: ibu, given: 1, planned: 2, lastAt: local(11, 8).toISOString() },
    ]);
  });

  it('leaves the twins’ daily care exactly as before (and no empty row for her routine)', () => {
    const logs = [dose('baby-A', local(11, 9)), motherDose(local(11, 8))];
    const rows = dailyCareStatus([vitD, ibu], logs, local(11, 0), local(12, 0));
    expect(rows.map((r) => [r.routine.id, r.cells])).toEqual([
      [
        'vitd',
        [
          { slot: 'A', given: 1, planned: 1 },
          { slot: 'B', given: 0, planned: 1 },
        ],
      ],
    ]);
    // A "both" twins' medicine is still only done when each twin had it.
    const both = base({ routines: [vitD], medLogs: logs, now: local(11, 10), pastMs: 2 * 3600_000 });
    expect(upcomingItems(both)).toHaveLength(1);
    expect(upcomingItems({ ...both, medLogs: [...logs, dose('baby-B', local(11, 9, 30))] })).toEqual([]);
  });
});
