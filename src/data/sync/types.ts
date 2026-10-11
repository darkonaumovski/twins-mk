import type { CollectionName } from '../repository';
import type { Entity, SyncMembership } from '../types';

export type { SyncMembership };

/** A record changed on this phone and not yet confirmed by the server. */
export interface OutboxEntry {
  collection: CollectionName;
  id: string;
  /** The version that was queued; a newer edit replaces the entry. */
  updatedAt: string;
}

export interface SyncChange {
  collection: CollectionName;
  record: Entity;
}

/** A downloaded record that changed this phone's data, with the version it replaced (if any). */
export interface AppliedChange extends SyncChange {
  previous: Entity | undefined;
}

export interface RemoteChange extends SyncChange {
  /** Server-wide change number; a phone pulls everything after the last one it saw. */
  seq: number;
}

/** What the sync engine needs from local storage (implemented by the Dexie store). */
export interface SyncLocal {
  pending(): Promise<OutboxEntry[]>;
  read(entries: readonly OutboxEntry[]): Promise<SyncChange[]>;
  /** Removes uploaded entries, unless the record changed again meanwhile. */
  acknowledge(entries: readonly OutboxEntry[]): Promise<void>;
  /** Merges downloaded records without queueing them for upload. Returns the ones that changed. */
  applyRemote(collection: CollectionName, records: Entity[]): Promise<AppliedChange[]>;
  /** Queues every local record, so joining a family uploads what this phone already has. */
  enqueueAll(): Promise<void>;
  getCursor(): Promise<number>;
  setCursor(seq: number): Promise<void>;
  /** Forgets the outbox and the cursor (when switching or leaving a family). */
  reset(): Promise<void>;
  /** Calls back with the number of queued changes now and whenever it changes. */
  watchPending(onChange: (count: number) => void): () => void;
}

export type SyncErrorCode = 'offline' | 'notFound' | 'full' | 'serverSetup' | 'failed';

export class SyncError extends Error {
  constructor(
    readonly code: SyncErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

/** The sync server. Implemented with Supabase, and in memory for tests. */
export interface SyncRemote {
  createFamily(): Promise<SyncMembership>;
  /** Joins (or re-joins) a family by code and returns its id. */
  joinFamily(code: string): Promise<string>;
  leaveFamily(familyId: string): Promise<void>;
  /** Uploads records; the server keeps the newest version of each. */
  push(familyId: string, changes: SyncChange[]): Promise<void>;
  /** Changes with `seq` greater than `after`, oldest first. */
  pull(familyId: string, after: number, limit: number): Promise<RemoteChange[]>;
  /** Calls `onChange` when the family's data changes on the server. Returns a function that stops listening. */
  listen(familyId: string, handlers: { onChange: () => void; onLive: (live: boolean) => void }): () => void;
}
