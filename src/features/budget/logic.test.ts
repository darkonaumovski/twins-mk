import { describe, expect, it } from 'vitest';
import type { PrepItem } from '@/data/types';
import { budgetByCategory, budgetTotals, missingActualPrices, missingEstimates, shoppingGroups } from './logic';

let n = 0;
const item = (over: Partial<PrepItem> = {}): PrepItem => ({
  id: `i${++n}`,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  deviceId: 'd',
  kind: 'item',
  name: 'Thing',
  seedKey: null,
  categoryId: 'c1',
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
  done: false,
  order: n,
  ...over,
});

describe('budgetTotals', () => {
  it('plans per unit, doubling per-baby items', () => {
    const totals = budgetTotals([
      item({ scope: 'perBaby', quantity: 1, estimatedUnitPrice: 6000 }), // 2 car seats
      item({ scope: 'shared', quantity: 1, estimatedUnitPrice: 2500 }), // 1 sterilizer
    ]);
    expect(totals.planned).toBe(14500);
    expect(totals.remainingMust).toBe(14500);
    expect(totals.projected).toBe(14500);
  });

  it('counts only the missing units as remaining', () => {
    const totals = budgetTotals([item({ scope: 'perBaby', quantity: 3, acquired: 4, estimatedUnitPrice: 300, actualPrice: 1150 })]);
    expect(totals).toEqual({ planned: 1800, spent: 1150, remainingMust: 600, remainingNice: 0, unpricedBought: 0, projected: 1750 });
  });

  it('splits remaining must-haves from nice-to-haves', () => {
    const totals = budgetTotals([
      item({ priority: 'must', estimatedUnitPrice: 100 }),
      item({ priority: 'nice', quantity: 2, estimatedUnitPrice: 50 }),
    ]);
    expect(totals.remainingMust).toBe(100);
    expect(totals.remainingNice).toBe(100);
  });

  it('counts gifted items as spending nothing and remaining nothing', () => {
    const totals = budgetTotals([item({ acquired: 1, status: 'gifted', estimatedUnitPrice: 9000 })]);
    expect(totals).toMatchObject({ planned: 9000, spent: 0, remainingMust: 0, projected: 0 });
  });

  it('ignores to-dos and items without prices', () => {
    expect(budgetTotals([item({ kind: 'task', estimatedUnitPrice: 100 }), item()])).toEqual({
      planned: 0,
      spent: 0,
      remainingMust: 0,
      remainingNice: 0,
      unpricedBought: 0,
      projected: 0,
    });
  });

  it('counts purchases without an actual price at their estimate', () => {
    // 3 of 4 bought without entering a price: 3 × 300 assumed spent, 1 × 300 still to buy.
    const totals = budgetTotals([item({ quantity: 4, acquired: 3, status: 'bought', estimatedUnitPrice: 300 })]);
    expect(totals).toMatchObject({ spent: 0, unpricedBought: 900, remainingMust: 300, projected: 1200 });
  });

  it('avoids floating point noise', () => {
    expect(budgetTotals([item({ actualPrice: 0.1 }), item({ actualPrice: 0.2 })]).spent).toBe(0.3);
  });
});

describe('budgetByCategory', () => {
  it('returns one row per category, in the given order', () => {
    const rows = budgetByCategory([item({ categoryId: 'b', actualPrice: 5 }), item({ categoryId: 'a', actualPrice: 7 })], ['a', 'b', 'c']);
    expect(rows.map((r) => [r.categoryId, r.spent])).toEqual([
      ['a', 7],
      ['b', 5],
      ['c', 0],
    ]);
  });
});

describe('missingEstimates', () => {
  it('lists unfinished items without an estimate', () => {
    const a = item();
    const b = item({ priority: 'nice' });
    const items = [a, b, item({ estimatedUnitPrice: 1 }), item({ acquired: 1 }), item({ kind: 'task' })];
    expect(missingEstimates(items)).toEqual([a, b]);
    expect(missingEstimates(items, 'must')).toEqual([a]);
  });
});

describe('shoppingGroups', () => {
  it('groups what is still needed by store, case-insensitively, with no-store last', () => {
    const groups = shoppingGroups(
      [
        item({ name: 'Wipes', store: 'Ramstore', estimatedUnitPrice: 100, quantity: 10, acquired: 4 }),
        item({ name: 'Cot', store: 'IKEA', scope: 'perBaby', estimatedUnitPrice: 5000 }),
        item({ name: 'Mattress', store: ' ikea ' }),
        item({ name: 'Hats' }),
        item({ name: 'Done', store: 'IKEA', acquired: 1 }),
        item({ name: 'Task', kind: 'task' }),
      ],
      { mustOnly: false },
    );
    expect(groups.map((g) => [g.store, g.items.map((i) => i.name), g.estimate])).toEqual([
      ['IKEA', ['Cot', 'Mattress'], 10000],
      ['Ramstore', ['Wipes'], 600],
      ['', ['Hats'], 0],
    ]);
  });

  it('puts must-haves first and can hide nice-to-haves', () => {
    const items = [item({ name: 'Nice', priority: 'nice' }), item({ name: 'Must' })];
    expect(shoppingGroups(items, { mustOnly: false })[0].items.map((i) => i.name)).toEqual(['Must', 'Nice']);
    expect(shoppingGroups(items, { mustOnly: true })[0].items.map((i) => i.name)).toEqual(['Must']);
  });
});

describe('missingActualPrices', () => {
  it('lists bought items without an actual price, but not gifts', () => {
    const a = item({ status: 'bought', acquired: 1 });
    const items = [a, item({ status: 'bought', acquired: 1, actualPrice: 0 }), item({ status: 'gifted', acquired: 1 }), item()];
    expect(missingActualPrices(items)).toEqual([a]);
  });
});
