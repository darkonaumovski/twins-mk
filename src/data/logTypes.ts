import type { LogEntry } from './types';

/** Entries that have a duration and can run as a timer: sleep and breastfeeding. */
export function isTimed(entry: LogEntry): boolean {
  return entry.type === 'sleep' || (entry.type === 'feed' && entry.data.method === 'breast');
}
