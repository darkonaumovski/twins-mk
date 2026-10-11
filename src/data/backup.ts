import { isEntity, type MergeStats } from './merge';
import { COLLECTIONS, type CollectionName, type DataStore } from './repository';
import type { Entity } from './types';

export const BACKUP_APP = 'twins-mk';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  data: Partial<Record<CollectionName, Entity[]>>;
}

export type BackupErrorCode = 'notJson' | 'notBackup' | 'newerVersion' | 'invalidRecord';

export class BackupError extends Error {
  constructor(
    readonly code: BackupErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

/** Every synced collection, tombstones included, so deletions survive a round trip. */
export async function exportBackup(store: DataStore, now = new Date()): Promise<BackupFile> {
  const data: BackupFile['data'] = {};
  for (const name of COLLECTIONS) {
    data[name] = await store[name].listAll();
  }
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), data };
}

export function parseBackup(text: string): BackupFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupError('notJson');
  }
  if (typeof json !== 'object' || json === null) throw new BackupError('notBackup');
  const file = json as Record<string, unknown>;
  if (file.app !== BACKUP_APP || typeof file.version !== 'number' || typeof file.data !== 'object' || file.data === null) {
    throw new BackupError('notBackup');
  }
  if (file.version > BACKUP_VERSION) throw new BackupError('newerVersion', String(file.version));

  const data: BackupFile['data'] = {};
  const raw = file.data as Record<string, unknown>;
  for (const name of COLLECTIONS) {
    const records = raw[name];
    if (records === undefined) continue;
    if (!Array.isArray(records)) throw new BackupError('invalidRecord', name);
    const bad = records.findIndex((r) => !isEntity(r));
    if (bad !== -1) throw new BackupError('invalidRecord', `${name}[${bad}]`);
    data[name] = records as Entity[];
  }
  return { app: BACKUP_APP, version: file.version, exportedAt: String(file.exportedAt ?? ''), data };
}

/** Merges a backup into the store (never deletes local data that the backup lacks). */
export async function importBackup(store: DataStore, file: BackupFile): Promise<Partial<Record<CollectionName, MergeStats>>> {
  return store.transaction(async () => {
    const report: Partial<Record<CollectionName, MergeStats>> = {};
    for (const name of COLLECTIONS) {
      const records = file.data[name];
      if (!records?.length) continue;
      // Each repository is typed to its own record shape; the backup was validated above.
      report[name] = await (store[name].merge as (r: Entity[]) => Promise<MergeStats>)(records);
    }
    return report;
  });
}
