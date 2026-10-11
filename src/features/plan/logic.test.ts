import { describe, expect, it } from 'vitest';
import type { Appointment, ParentTask, Routine, RoutineDone } from '@/data/types';
import { reminderTime, scheduledOccurrences, sortTasks, upcomingItems, type UpcomingInput } from './logic';

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
