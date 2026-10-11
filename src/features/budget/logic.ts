import { isComplete, neededTotal, remaining } from '@/features/checklist/logic';
import type { PrepItem, Priority } from '@/data/types';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface BudgetTotals {
  /** Estimated cost of everything on the list (estimate × total units needed). */
  planned: number;
  /** Sum of actual prices paid. */
  spent: number;
  /** Estimated cost of the units still missing, must-haves only. */
  remainingMust: number;
  remainingNice: number;
  /** Estimated cost of units bought without an actual price yet (so the forecast does not drop when you forget to enter a price). */
  unpricedBought: number;
  /** What the whole list will have cost: spent + unpriced purchases at their estimate + estimates for what is still missing. */
  projected: number;
}

export interface CategoryBudget extends BudgetTotals {
  categoryId: string;
}

/** Only physical items have prices; to-dos are ignored. */
const priced = (items: readonly PrepItem[]) => items.filter((i) => i.kind === 'item');

function remainingCost(item: PrepItem): number {
  return item.estimatedUnitPrice === null ? 0 : item.estimatedUnitPrice * remaining(item);
}

export function budgetTotals(items: readonly PrepItem[]): BudgetTotals {
  let planned = 0;
  let spent = 0;
  let remainingMust = 0;
  let remainingNice = 0;
  let unpricedBought = 0;
  for (const item of priced(items)) {
    if (item.estimatedUnitPrice !== null) planned += item.estimatedUnitPrice * neededTotal(item);
    if (item.actualPrice !== null) spent += item.actualPrice;
    else if (item.status === 'bought' && item.estimatedUnitPrice !== null) {
      unpricedBought += item.estimatedUnitPrice * Math.min(item.acquired, neededTotal(item));
    }
    if (item.priority === 'must') remainingMust += remainingCost(item);
    else remainingNice += remainingCost(item);
  }
  return {
    planned: round2(planned),
    spent: round2(spent),
    remainingMust: round2(remainingMust),
    remainingNice: round2(remainingNice),
    unpricedBought: round2(unpricedBought),
    projected: round2(spent + unpricedBought + remainingMust + remainingNice),
  };
}

export function budgetByCategory(items: readonly PrepItem[], categoryIds: readonly string[]): CategoryBudget[] {
  return categoryIds.map((categoryId) => ({ categoryId, ...budgetTotals(items.filter((i) => i.categoryId === categoryId)) }));
}

/** Unfinished items that have no price estimate yet, so remaining totals are incomplete. */
export function missingEstimates(items: readonly PrepItem[], priority?: Priority): PrepItem[] {
  return priced(items).filter(
    (i) => i.estimatedUnitPrice === null && !isComplete(i) && (priority === undefined || i.priority === priority),
  );
}

// ---------- Shopping mode ----------

export interface ShoppingGroup {
  /** The store as typed by the user; '' for items without a store. */
  store: string;
  items: PrepItem[];
  /** Estimated cost of what is still missing in this group (items without an estimate add nothing). */
  estimate: number;
}

/**
 * Everything still to buy, grouped by store. Store names are matched
 * case-insensitively ("Ikea" and "IKEA " are one group). Groups are sorted by
 * name with the "no store" group last; must-haves come first within a group,
 * otherwise items keep the order they were given in.
 */
export function shoppingGroups(items: readonly PrepItem[], opts: { mustOnly: boolean }): ShoppingGroup[] {
  const groups = new Map<string, ShoppingGroup>();
  for (const item of priced(items)) {
    if (isComplete(item)) continue;
    if (opts.mustOnly && item.priority !== 'must') continue;
    const store = item.store.trim();
    const key = store.toLocaleLowerCase();
    const group = groups.get(key) ?? { store, items: [], estimate: 0 };
    group.items.push(item);
    group.estimate = round2(group.estimate + remainingCost(item));
    groups.set(key, group);
  }
  const sorted = [...groups.values()].sort((a, b) => {
    if (!a.store) return 1;
    if (!b.store) return -1;
    return a.store.localeCompare(b.store);
  });
  for (const g of sorted) {
    // Stable sort: keeps the caller's (checklist) order within each priority.
    g.items.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'must' ? -1 : 1));
  }
  return sorted;
}

/** Items marked as bought but with no actual price, so "spent" is understated. */
export function missingActualPrices(items: readonly PrepItem[]): PrepItem[] {
  return priced(items).filter((i) => i.status === 'bought' && i.acquired > 0 && i.actualPrice === null);
}
