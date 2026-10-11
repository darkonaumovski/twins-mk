import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  completionPatch,
  isComplete,
  isOverdue,
  matchesFilters,
  neededByDate,
  neededTotal,
  NO_FILTERS,
  parseAmount,
  progress,
  remaining,
  withAcquired,
  withStatus,
} from './logic';
import type { PrepItem } from '@/data/types';

const item = (over: Partial<PrepItem> = {}): PrepItem => ({
  id: 'i1',
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  deviceId: 'd',
  kind: 'item',
  name: 'Car seat',
  seedKey: null,
  categoryId: 'travel',
  scope: 'perBaby',
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
  done: false,
  order: 0,
  ...over,
});

describe('quantities', () => {
  it('doubles per-baby quantities and keeps shared ones', () => {
    expect(neededTotal(item({ scope: 'perBaby', quantity: 1 }))).toBe(2);
    expect(neededTotal(item({ scope: 'perBaby', quantity: 6 }))).toBe(12);
    expect(neededTotal(item({ scope: 'shared', quantity: 1 }))).toBe(1);
  });

  it('is complete only when enough units are acquired', () => {
    expect(isComplete(item({ acquired: 1 }))).toBe(false);
    expect(remaining(item({ acquired: 1 }))).toBe(1);
    expect(isComplete(item({ acquired: 2 }))).toBe(true);
    expect(isComplete(item({ acquired: 3 }))).toBe(true);
    expect(remaining(item({ acquired: 3 }))).toBe(0);
  });

  it('treats to-dos as done/not done', () => {
    expect(isComplete(item({ kind: 'task', done: false }))).toBe(false);
    expect(isComplete(item({ kind: 'task', done: true }))).toBe(true);
    expect(remaining(item({ kind: 'task', done: false }))).toBe(1);
  });

  it('counts progress by items', () => {
    expect(progress([item({ acquired: 2 }), item(), item({ kind: 'task', done: true })])).toEqual({ done: 2, total: 3 });
    expect(progress([])).toEqual({ done: 0, total: 0 });
  });
});

describe('status and quantity stay consistent', () => {
  it('ticking an item fills the quantity and marks it bought', () => {
    expect(completionPatch(item({ acquired: 1 }), true)).toEqual({ acquired: 2, status: 'bought' });
  });

  it('ticking keeps an existing gifted/borrowed status', () => {
    expect(completionPatch(item({ status: 'gifted' }), true)).toEqual({ acquired: 2, status: 'gifted' });
  });

  it('unticking resets to needed', () => {
    expect(completionPatch(item({ acquired: 2, status: 'bought' }), false)).toEqual({ acquired: 0, status: 'needed' });
    expect(completionPatch(item({ kind: 'task' }), true)).toEqual({ done: true });
  });

  it('choosing an acquired status fills the quantity', () => {
    expect(withStatus(item({ acquired: 1 }), 'borrowed')).toMatchObject({ status: 'borrowed', acquired: 2 });
    expect(withStatus(item({ acquired: 1 }), 'ordered')).toMatchObject({ status: 'ordered', acquired: 1 });
  });

  it('acquiring enough units marks a needed item as bought', () => {
    expect(withAcquired(item(), 2)).toMatchObject({ acquired: 2, status: 'bought' });
    expect(withAcquired(item({ status: 'ordered' }), 1)).toMatchObject({ acquired: 1, status: 'ordered' });
    expect(withAcquired(item({ status: 'gifted' }), 2)).toMatchObject({ status: 'gifted' });
  });
});

describe('needed by and overdue', () => {
  it('converts pregnancy weeks using the due date', () => {
    expect(neededByDate({ kind: 'week', week: 36 }, '2027-01-20')).toBe('2026-12-23');
    expect(neededByDate({ kind: 'week', week: 36 }, null)).toBeNull();
    expect(neededByDate({ kind: 'date', date: '2026-12-01' }, null)).toBe('2026-12-01');
    expect(neededByDate(null, '2027-01-20')).toBeNull();
  });

  it('flags only unfinished items whose date has passed', () => {
    const late = item({ neededBy: { kind: 'date', date: '2026-10-01' } });
    expect(isOverdue(late, null, '2026-10-11')).toBe(true);
    expect(isOverdue({ ...late, acquired: 2 }, null, '2026-10-11')).toBe(false);
    expect(isOverdue(late, null, '2026-10-01')).toBe(false);
    expect(isOverdue(item(), '2027-01-20', '2026-10-11')).toBe(false);
  });
});

describe('filters', () => {
  const ctx = { label: (i: PrepItem) => i.name, dueDate: null, today: '2026-10-11' };
  const items = [
    item({ id: 'a', name: 'Car seat', categoryId: 'travel', store: 'BabyShop' }),
    item({ id: 'b', name: 'Bottles', categoryId: 'feeding', acquired: 8, status: 'bought', priority: 'nice' }),
    item({ id: 'c', name: 'Pack the bag', kind: 'task', categoryId: 'hospital', neededBy: { kind: 'date', date: '2026-10-01' } }),
  ];
  const ids = (f: Partial<typeof NO_FILTERS>) => items.filter((i) => matchesFilters(i, { ...NO_FILTERS, ...f }, ctx)).map((i) => i.id);

  it('passes everything without filters', () => expect(ids({})).toEqual(['a', 'b', 'c']));
  it('filters by category', () => expect(ids({ category: 'feeding' })).toEqual(['b']));
  it('filters by priority', () => expect(ids({ priority: 'must' })).toEqual(['a', 'c']));
  it('filters open and done', () => {
    expect(ids({ status: 'open' })).toEqual(['a', 'c']);
    expect(ids({ status: 'done' })).toEqual(['b']);
  });
  it('filters by a specific status, excluding to-dos', () => expect(ids({ status: 'needed' })).toEqual(['a']));
  it('filters overdue', () => expect(ids({ overdueOnly: true })).toEqual(['c']));
  it('searches name and store, case-insensitively', () => {
    expect(ids({ q: 'BOTT' })).toEqual(['b']);
    expect(ids({ q: 'babyshop' })).toEqual(['a']);
  });
  it('counts active filters (search excluded)', () => {
    expect(activeFilterCount({ ...NO_FILTERS, q: 'x' })).toBe(0);
    expect(activeFilterCount({ ...NO_FILTERS, category: 'x', overdueOnly: true })).toBe(2);
  });
});

describe('parseAmount', () => {
  it.each([
    ['', null],
    ['1500', 1500],
    ['1.500', 1500],
    ['1,500', 1500],
    ['12,5', 12.5],
    ['9.99', 9.99],
    ['1.234,50', 1234.5],
    ['1,234.50', 1234.5],
    ['1 234', 1234],
    ['1.234.567', 1234567],
    ['abc', null],
    ['-5', null],
  ])('%s → %s', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });
});
