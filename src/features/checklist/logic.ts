import { dateOfWeek } from '@/lib/pregnancy';
import type { ISODate, NeededBy, PrepItem, PrepStatus, Priority, RecordPatch } from '@/data/types';

export const TWIN_COUNT = 2;

type QtyFields = Pick<PrepItem, 'scope' | 'quantity'>;
type CompletionFields = Pick<PrepItem, 'kind' | 'scope' | 'quantity' | 'acquired' | 'done'>;

/** Total units needed: per-baby quantities are doubled for twins. */
export function neededTotal(item: QtyFields): number {
  return item.scope === 'perBaby' ? item.quantity * TWIN_COUNT : item.quantity;
}

export function remaining(item: CompletionFields): number {
  if (item.kind === 'task') return item.done ? 0 : 1;
  return Math.max(0, neededTotal(item) - item.acquired);
}

export function isComplete(item: CompletionFields): boolean {
  return remaining(item) === 0;
}

/** Statuses that mean the item is in hand. */
export const ACQUIRED_STATUSES: readonly PrepStatus[] = ['bought', 'gifted', 'borrowed'];

export function neededByDate(neededBy: NeededBy, dueDate: ISODate | null): ISODate | null {
  if (!neededBy) return null;
  if (neededBy.kind === 'date') return neededBy.date;
  return dueDate ? dateOfWeek(dueDate, neededBy.week) : null;
}

export function isOverdue(item: CompletionFields & Pick<PrepItem, 'neededBy'>, dueDate: ISODate | null, today: ISODate): boolean {
  if (isComplete(item)) return false;
  const date = neededByDate(item.neededBy, dueDate);
  return date !== null && date < today;
}

export interface Progress {
  done: number;
  total: number;
}

export function progress(items: readonly CompletionFields[]): Progress {
  return { done: items.filter(isComplete).length, total: items.length };
}

/** The change a one-tap "done / not done" toggle makes. */
export function completionPatch(item: PrepItem, complete: boolean): RecordPatch<PrepItem> {
  if (item.kind === 'task') return { done: complete };
  if (complete) {
    return {
      acquired: Math.max(item.acquired, neededTotal(item)),
      status: ACQUIRED_STATUSES.includes(item.status) ? item.status : 'bought',
    };
  }
  return { acquired: 0, status: 'needed' };
}

type DraftQty = Pick<PrepItem, 'scope' | 'quantity' | 'acquired' | 'status'>;

/** Choosing "bought/gifted/borrowed" means we now have all of them. */
export function withStatus<T extends DraftQty>(draft: T, status: PrepStatus): T {
  const acquired = ACQUIRED_STATUSES.includes(status) ? Math.max(draft.acquired, neededTotal(draft)) : draft.acquired;
  return { ...draft, status, acquired };
}

/** Having enough units of something still "needed" or "ordered" suggests it was bought. */
export function withAcquired<T extends DraftQty>(draft: T, acquired: number): T {
  const enough = acquired >= neededTotal(draft) && neededTotal(draft) > 0;
  const status = enough && !ACQUIRED_STATUSES.includes(draft.status) ? 'bought' : draft.status;
  return { ...draft, acquired, status };
}

// ---------- Filtering ----------

export type StatusFilter = 'all' | 'open' | 'done' | PrepStatus;

export interface ChecklistFilters {
  q: string;
  category: string | 'all';
  status: StatusFilter;
  priority: Priority | 'all';
  overdueOnly: boolean;
}

export const NO_FILTERS: ChecklistFilters = { q: '', category: 'all', status: 'all', priority: 'all', overdueOnly: false };

export function activeFilterCount(f: ChecklistFilters): number {
  return [f.category !== 'all', f.status !== 'all', f.priority !== 'all', f.overdueOnly].filter(Boolean).length;
}

export function matchesFilters(
  item: PrepItem,
  f: ChecklistFilters,
  ctx: { label: (item: PrepItem) => string; dueDate: ISODate | null; today: ISODate },
): boolean {
  if (f.category !== 'all' && item.categoryId !== f.category) return false;
  if (f.priority !== 'all' && item.priority !== f.priority) return false;
  if (f.overdueOnly && !isOverdue(item, ctx.dueDate, ctx.today)) return false;
  switch (f.status) {
    case 'all':
      break;
    case 'open':
      if (isComplete(item)) return false;
      break;
    case 'done':
      if (!isComplete(item)) return false;
      break;
    default:
      // Statuses only describe physical items, not to-dos.
      if (item.kind === 'task' || item.status !== f.status) return false;
  }
  const q = f.q.trim().toLocaleLowerCase();
  if (q) {
    const haystack = [ctx.label(item), item.store, item.notes].join(' ').toLocaleLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

/** Parses money typed with either a comma or a dot as the decimal separator ("1.234,50", "1,234.50", "12,5"). */
export function parseAmount(input: string): number | null {
  const s = input.replace(/[\s ']/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized: string;
  if (lastComma !== -1 && lastDot !== -1) {
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    normalized = s.split(thousands).join('').replace(decimal, '.');
  } else {
    // A single separator followed by exactly three digits is a thousands separator ("1.500", "1,500");
    // otherwise it is the decimal point ("12,5", "9.99"). Repeated separators are always thousands.
    const sep = lastComma !== -1 ? ',' : '.';
    const parts = s.split(sep);
    normalized = parts.length === 2 && parts[1].length !== 3 ? parts.join('.') : parts.join('');
  }
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}
