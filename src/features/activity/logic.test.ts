import { describe, expect, it } from 'vitest';
import type { ActivityEntry, Entity, LogEntry, ParentTask, Routine } from '@/data/types';
import { authorOf, entryAction, fieldChanges, filterEntries, groupByDay, incomingEntries, recordFields } from './logic';

const meta = (over: Partial<Entity> = {}): Entity => ({
  id: 'x',
  createdAt: '2026-10-11T08:00:00.000Z',
  updatedAt: '2026-10-11T08:00:00.000Z',
  deletedAt: null,
  deviceId: 'other-phone',
  ...over,
});

const task = (over: Partial<ParentTask> = {}): ParentTask => ({
  ...meta(),
  title: 'Call the pediatrician',
  assignee: 'p1',
  due: null,
  done: false,
  notes: '',
  ...over,
});

const entry = (record: Entity, previous?: Entity, over: Partial<ActivityEntry> = {}): ActivityEntry => ({
  at: record.updatedAt,
  collection: 'tasks',
  recordId: record.id,
  by: 'p2',
  mine: false,
  seen: 0,
  record,
  previous,
  ...over,
});

describe('recordFields', () => {
  it('flattens nested fields and leaves out bookkeeping', () => {
    const routine = {
      ...meta({ updatedBy: 'p1' }),
      title: 'Vitamin D',
      babies: 'both',
      rule: { kind: 'everyDays', days: 1, times: ['09:00'], startDate: '2026-10-12' },
      active: true,
      med: { name: 'Vitamin D', dose: '1 drop', minIntervalHours: null },
    } as Routine;
    expect([...recordFields(routine).keys()]).toEqual([
      'title',
      'babies',
      'rule.kind',
      'rule.days',
      'rule.times',
      'rule.startDate',
      'active',
      'med.name',
      'med.dose',
      'med.minIntervalHours',
    ]);
  });
});

describe('fieldChanges', () => {
  it('lists only the fields that changed, with before and after', () => {
    const before = task();
    const after = task({ done: true, notes: 'Booked for Monday', updatedAt: '2026-10-11T09:00:00.000Z' });
    expect(entryAction(entry(after, before))).toBe('changed');
    expect(fieldChanges(entry(after, before))).toEqual([
      { path: 'done', before: false, after: true },
      { path: 'notes', before: '', after: 'Booked for Monday' },
    ]);
  });

  it('shows the filled-in fields of something new', () => {
    expect(fieldChanges(entry(task()))).toEqual([
      { path: 'title', before: undefined, after: 'Call the pediatrician' },
      { path: 'assignee', before: undefined, after: 'p1' },
    ]);
  });

  it('shows what was deleted', () => {
    const before = task();
    const after = task({ deletedAt: '2026-10-11T09:00:00.000Z' });
    expect(entryAction(entry(after, before))).toBe('deleted');
    expect(fieldChanges(entry(after, before)).map((f) => [f.path, f.before, f.after])).toEqual([
      ['title', 'Call the pediatrician', undefined],
      ['assignee', 'p1', undefined],
    ]);
  });

  it('compares nested values of log entries', () => {
    const feed = (ml: number) =>
      ({
        ...meta({ id: 'log-1' }),
        babyId: 'baby-A',
        type: 'feed',
        start: '2026-10-11T08:00:00.000Z',
        end: null,
        groupId: null,
        loggedBy: 'p2',
        data: { method: 'bottle', ml, milk: 'formula' },
      }) as LogEntry;
    expect(fieldChanges(entry(feed(120), feed(90)))).toEqual([{ path: 'data.ml', before: 90, after: 120 }]);
  });
});

describe('authorOf', () => {
  it('prefers who stamped the change', () => {
    expect(authorOf(task({ updatedBy: 'h1' }), 'tasks', 'p1', ['p1', 'p2', 'h1'])).toBe('h1');
  });

  it('falls back to who logged an entry, then the only other person', () => {
    const log = { ...meta(), loggedBy: 'p2' } as unknown as Entity;
    expect(authorOf(log, 'logs', 'p1', ['p1', 'p2', 'h1'])).toBe('p2');
    expect(authorOf(task(), 'tasks', 'p1', ['p1', 'p2'])).toBe('p2');
    expect(authorOf(task(), 'tasks', 'p1', ['p1', 'p2', 'h1'])).toBeNull();
  });
});

describe('incomingEntries', () => {
  it('makes unseen history entries for changes from another phone', () => {
    const record = task({ updatedBy: 'p2', updatedAt: '2026-10-11T10:00:00.000Z' });
    expect(incomingEntries([{ collection: 'tasks', record, previous: undefined }], 'p1', ['p1', 'p2'])).toEqual([
      { at: record.updatedAt, collection: 'tasks', recordId: 'x', by: 'p2', mine: false, seen: 0, record, previous: undefined },
    ]);
  });
});

describe('filterEntries and groupByDay', () => {
  const mine = entry(task({ updatedAt: '2026-10-12T10:00:00' }), undefined, { mine: true, seen: 1 });
  const theirs = entry(task({ updatedAt: '2026-10-12T08:00:00' }));
  const older = entry(task({ updatedAt: '2026-10-10T20:00:00' }));

  it('filters by who made the change', () => {
    expect(filterEntries([mine, theirs], 'mine')).toEqual([mine]);
    expect(filterEntries([mine, theirs], 'others')).toEqual([theirs]);
    expect(filterEntries([mine, theirs], 'all')).toHaveLength(2);
  });

  it('groups by local day, keeping the order', () => {
    expect(groupByDay([mine, theirs, older]).map((g) => [g.day, g.entries.length])).toEqual([
      ['2026-10-12', 2],
      ['2026-10-10', 1],
    ]);
  });
});
