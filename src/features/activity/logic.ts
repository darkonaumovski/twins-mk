import type { CollectionName } from '@/data/repository';
import type { AppliedChange } from '@/data/sync/types';
import type { ActivityEntry, CaregiverId, Entity, LogEntry, Pump } from '@/data/types';
import { changeAction, type ChangeAction } from '@/features/sync/changes';

/** How long the notification history is kept, and at most how many entries. */
export const KEEP_DAYS = 90;
export const KEEP_ENTRIES = 3000;

/** Bookkeeping fields that say nothing to a parent (who and when are shown separately). */
const HIDDEN = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt', 'deviceId', 'updatedBy', 'seedKey', 'order', 'groupId', 'pumpId']);

export function entryAction(entry: Pick<ActivityEntry, 'record' | 'previous'>): ChangeAction {
  return changeAction({ collection: 'logs', record: entry.record, previous: entry.previous }) ?? 'changed';
}

/**
 * Who made a change from another phone. Newer versions stamp `updatedBy` on every change;
 * for older records, log entries and pumping sessions name who logged them, and anything
 * else is credited to the only other person in the family (unknown when there are helpers).
 */
export function authorOf(record: Entity, collection: string, me: CaregiverId, caregiverIds: readonly CaregiverId[]): CaregiverId | null {
  if (record.updatedBy) return record.updatedBy;
  if (collection === 'logs' || collection === 'pumps') return (record as LogEntry | Pump).loggedBy ?? null;
  const others = caregiverIds.filter((id) => id !== me);
  return others.length === 1 ? others[0] : null;
}

/** History entries for changes that sync brought in from another phone (unseen until the page is opened). */
export function incomingEntries(changes: readonly AppliedChange[], me: CaregiverId, caregiverIds: readonly CaregiverId[]): ActivityEntry[] {
  return changes.map((c) => ({
    at: c.record.updatedAt,
    collection: c.collection,
    recordId: c.record.id,
    by: authorOf(c.record, c.collection, me, caregiverIds),
    mine: false,
    seen: 0,
    record: c.record,
    previous: c.previous,
  }));
}

/** The record as an AppliedChange, so the one-line descriptions from the change alerts can be reused. */
export function asChange(entry: ActivityEntry): AppliedChange {
  return { collection: entry.collection as CollectionName, record: entry.record, previous: entry.previous };
}

/** Every leaf field of a record by its path (`data.ml`, `rule.times`), bookkeeping left out. Lists count as one value. */
export function recordFields(record: Entity | undefined): Map<string, unknown> {
  const out = new Map<string, unknown>();
  // The mother's check-in (mood, sleep, note) is only shown on the Mother page.
  const privateData = (record as { type?: unknown } | undefined)?.type === 'checkin';
  const walk = (value: unknown, path: string) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k);
    } else if (path && !HIDDEN.has(path.split('.')[0]) && !(privateData && path.startsWith('data.'))) {
      out.set(path, value);
    }
  };
  walk(record, '');
  return out;
}

const isBlank = (v: unknown) => v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export interface FieldChange {
  path: string;
  /** undefined: the field had no value (something new). */
  before: unknown;
  /** undefined: the field has no value any more (something deleted). */
  after: unknown;
}

/**
 * Exactly what changed: for an edit, each field whose value differs (before and after);
 * for something new, every field that was filled in; for a delete, what was deleted.
 */
export function fieldChanges(entry: Pick<ActivityEntry, 'record' | 'previous'>): FieldChange[] {
  const action = entryAction(entry);
  if (action === 'added') {
    return [...recordFields(entry.record)].filter(([, v]) => !isBlank(v)).map(([path, after]) => ({ path, before: undefined, after }));
  }
  if (action === 'deleted') {
    return [...recordFields(entry.previous ?? entry.record)]
      .filter(([, v]) => !isBlank(v))
      .map(([path, before]) => ({ path, before, after: undefined }));
  }
  const before = recordFields(entry.previous);
  const after = recordFields(entry.record);
  const paths = [...new Set([...before.keys(), ...after.keys()])];
  return paths
    .filter((p) => !same(before.get(p), after.get(p)))
    .map((path) => ({ path, before: before.get(path), after: after.get(path) }));
}

export type HistoryFilter = 'all' | 'others' | 'mine';

export function filterEntries(entries: readonly ActivityEntry[], filter: HistoryFilter): ActivityEntry[] {
  if (filter === 'all') return [...entries];
  return entries.filter((e) => e.mine === (filter === 'mine'));
}

/** Entries grouped by calendar day (local time), newest day first; entries keep their order. */
export function groupByDay(entries: readonly ActivityEntry[]): { day: string; entries: ActivityEntry[] }[] {
  const groups: { day: string; entries: ActivityEntry[] }[] = [];
  for (const entry of entries) {
    const d = new Date(entry.at);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const last = groups[groups.length - 1];
    if (last?.day === day) last.entries.push(entry);
    else groups.push({ day, entries: [entry] });
  }
  return groups;
}
