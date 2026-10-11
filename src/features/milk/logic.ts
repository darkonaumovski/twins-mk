import { differenceInCalendarDays } from 'date-fns';
import type { ISODateTime, MilkStashItem, Pump, SharedSettings, StashLocation } from '@/data/types';

/** Total millilitres of a session: the sides added up when given, otherwise the total entered. */
export function pumpTotal(leftMl: number | null, rightMl: number | null, totalMl: number | null): number {
  if (leftMl !== null || rightMl !== null) return (leftMl ?? 0) + (rightMl ?? 0);
  return totalMl ?? 0;
}

/** Milk still in the stash: not used up, not deleted, something left in it. */
export function inStash(item: MilkStashItem): boolean {
  return item.deletedAt === null && item.usedAt === null && item.ml > 0;
}

/** Oldest first, the order milk is used in. */
export function stashOldestFirst(items: readonly MilkStashItem[]): MilkStashItem[] {
  return items.filter(inStash).sort((a, b) => a.pumpedAt.localeCompare(b.pumpedAt) || a.id.localeCompare(b.id));
}

export function stashTotals(items: readonly MilkStashItem[]): Record<StashLocation, number> {
  const totals: Record<StashLocation, number> = { fridge: 0, freezer: 0 };
  for (const item of items) if (inStash(item)) totals[item.location] += item.ml;
  return totals;
}

export interface StashDraw {
  /** Patches to write: a container used up, or what is left in it. */
  changes: { id: string; ml: number; usedAt: ISODateTime | null }[];
  /** Millilitres taken from the stash. */
  drawn: number;
  /** Millilitres the stash could not cover. */
  missing: number;
}

/**
 * Takes `ml` from the stash, oldest container first (first in, first out).
 * A container that is only partly needed keeps the rest.
 */
export function drawFromStash(items: readonly MilkStashItem[], ml: number, now: Date): StashDraw {
  const changes: StashDraw['changes'] = [];
  let left = Math.max(0, ml);
  for (const item of stashOldestFirst(items)) {
    if (left <= 0) break;
    if (item.ml <= left) {
      changes.push({ id: item.id, ml: item.ml, usedAt: now.toISOString() });
      left -= item.ml;
    } else {
      changes.push({ id: item.id, ml: item.ml - left, usedAt: null });
      left = 0;
    }
  }
  return { changes, drawn: Math.max(0, ml) - left, missing: left };
}

export interface StashAge {
  /** Whole calendar days since pumping. */
  days: number;
  /** Days left within the parents' own "use within" limit for its place, if they set one. */
  daysLeft: number | null;
}

export function stashAge(item: MilkStashItem, useWithin: SharedSettings['stashUseWithinDays'], now: Date): StashAge {
  const days = Math.max(0, differenceInCalendarDays(now, new Date(item.pumpedAt)));
  const limit = useWithin[item.location];
  return { days, daysLeft: limit ? limit - days : null };
}

/** Pumped millilitres per local day [from, to) for each day given. */
export function pumpedPerDay(pumps: readonly Pump[], days: readonly { from: Date; to: Date }[]): number[] {
  return days.map(({ from, to }) => {
    const f = from.toISOString();
    const t = to.toISOString();
    return pumps.filter((p) => p.deletedAt === null && p.start >= f && p.start < t).reduce((sum, p) => sum + p.totalMl, 0);
  });
}
