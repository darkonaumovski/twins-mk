import type { ISODateTime, LogEntry, Supply, SupplySource } from '@/data/types';

/** Built-in supplies have fixed ids, so both phones set up the same record. */
export const SUPPLY_IDS: Record<SupplySource, string> = { diapers: 'supply-diapers', formula: 'supply-formula' };
/** The starter-checklist item each supply restocks through the shopping list. */
export const SUPPLY_CHECKLIST_ITEMS: Record<SupplySource, string> = { diapers: 'seed-item-diapers', formula: 'seed-item-formula' };

/** Days of use the "days left" estimate looks at. */
export const USAGE_WINDOW_DAYS = 3;
const DAY_MS = 24 * 3600_000;

/** What one log entry uses: one diaper per diaper entry (per twin), or ml of formula (bottles and top-ups). */
export function entryUse(source: SupplySource, e: LogEntry): number {
  if (e.deletedAt !== null) return 0;
  if (source === 'diapers') return e.type === 'diaper' ? 1 : 0;
  if (e.type !== 'feed') return 0;
  if (e.data.method === 'bottle') return e.data.milk === 'formula' ? e.data.ml : 0;
  return e.data.topUp?.milk === 'formula' ? e.data.topUp.ml : 0;
}

/** Use logged in [from, to). */
export function usageBetween(source: SupplySource, entries: readonly LogEntry[], from: ISODateTime, to: ISODateTime): number {
  return entries.filter((e) => e.start >= from && e.start < to).reduce((sum, e) => sum + entryUse(source, e), 0);
}

export interface SupplyStatus {
  /** Left now: the counted stock minus the use logged since the count (never below 0). */
  remaining: number;
  /** Average use per day over the last few days. */
  perDay: number;
  /** About how many days the rest lasts at that pace; null while there is no recent use. */
  daysLeft: number | null;
  /** Fewer days left than the parents' threshold (or nothing left). */
  low: boolean;
}

/** `entries` must cover both the time since the count and the usage window. */
export function supplyStatus(supply: Supply, entries: readonly LogEntry[], now: Date): SupplyStatus {
  const nowIso = now.toISOString();
  const used = usageBetween(supply.source, entries, supply.countedAt, nowIso);
  const remaining = Math.max(0, supply.stock - used);
  const windowStart = new Date(now.getTime() - USAGE_WINDOW_DAYS * DAY_MS).toISOString();
  const perDay = usageBetween(supply.source, entries, windowStart, nowIso) / USAGE_WINDOW_DAYS;
  const daysLeft = perDay > 0 ? remaining / perDay : null;
  const low = remaining <= 0 || (daysLeft !== null && daysLeft < supply.lowThresholdDays);
  return { remaining, perDay, daysLeft, low };
}

/** A restock: what is left now plus the packs, counted from now. */
export function restockPatch(supply: Supply, entries: readonly LogEntry[], now: Date, packs = 1): Pick<Supply, 'stock' | 'countedAt'> {
  const { remaining } = supplyStatus(supply, entries, now);
  return { stock: remaining + packs * supply.packSize, countedAt: now.toISOString() };
}

/** The earliest time the log entries for a status must reach back to. */
export function supplyEntriesSince(supplies: readonly Supply[], now: Date): ISODateTime {
  const windowStart = new Date(now.getTime() - USAGE_WINDOW_DAYS * DAY_MS).toISOString();
  return supplies.reduce((min, s) => (s.countedAt < min ? s.countedAt : min), windowStart);
}
