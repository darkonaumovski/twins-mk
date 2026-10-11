import type { LogEntry, LogType } from './types';

/**
 * Every log type this version understands. Entries of other types can arrive
 * from a phone running a newer version; they are kept (and synced) but not shown,
 * so an older screen never meets data it cannot draw.
 */
export const KNOWN_LOG_TYPES: readonly LogType[] = ['feed', 'diaper', 'sleep', 'med', 'measure', 'note', 'temp', 'spitup', 'bath', 'tummy'];

const KNOWN = new Set<string>(KNOWN_LOG_TYPES);

export function isKnownLog(entry: { type: string }): entry is LogEntry {
  return KNOWN.has(entry.type);
}

/** Entries that have a duration and can run as a timer: sleep and breastfeeding. */
export function isTimed(entry: LogEntry): boolean {
  return entry.type === 'sleep' || (entry.type === 'feed' && entry.data.method === 'breast');
}
