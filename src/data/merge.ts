import type { Entity } from './types';

export interface MergeStats {
  added: number;
  updated: number;
  unchanged: number;
}

/**
 * Returns true if `incoming` should replace `local`.
 * Last writer wins on `updatedAt`; equal timestamps fall back to a stable
 * comparison of `deviceId` so both phones reach the same result.
 */
export function incomingWins(local: Entity, incoming: Entity): boolean {
  if (incoming.updatedAt !== local.updatedAt) return incoming.updatedAt > local.updatedAt;
  if (incoming.deviceId !== local.deviceId) return incoming.deviceId > local.deviceId;
  return false;
}

/**
 * Pure merge of incoming records into local ones. Returns the records that
 * must be written. Tombstones are ordinary records here, so a delete made on
 * one phone wins over an older edit on the other.
 */
export function planMerge<T extends Entity>(
  local: readonly T[],
  incoming: readonly T[],
): { toWrite: T[]; stats: MergeStats } {
  const byId = new Map(local.map((r) => [r.id, r]));
  const toWrite: T[] = [];
  const stats: MergeStats = { added: 0, updated: 0, unchanged: 0 };

  for (const record of incoming) {
    const existing = byId.get(record.id);
    if (!existing) {
      stats.added++;
      toWrite.push(record);
      byId.set(record.id, record);
    } else if (incomingWins(existing, record)) {
      stats.updated++;
      toWrite.push(record);
      byId.set(record.id, record);
    } else {
      stats.unchanged++;
    }
  }
  return { toWrite, stats };
}

/** Checks the minimum shape a record needs before it can be merged. */
export function isEntity(value: unknown): value is Entity {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    r.id.length > 0 &&
    typeof r.createdAt === 'string' &&
    typeof r.updatedAt === 'string' &&
    (r.deletedAt === null || typeof r.deletedAt === 'string') &&
    typeof r.deviceId === 'string'
  );
}
