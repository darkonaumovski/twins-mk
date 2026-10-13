import type { CollectionName } from '../repository';
import type { Entity, PhotoMime, ReminderKind, SyncMembership } from '../types';

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
  /** The photos' images (absent in stores without photos). */
  photos?: PhotoSyncLocal;
}

/** A photo whose images still have to go up to the family's Storage bucket. */
export interface PhotoUpload {
  id: string;
  mime: PhotoMime;
  full: Blob | null;
  thumb: Blob | null;
}

/** What the sync engine needs for photos (implemented by the Dexie store). */
export interface PhotoSyncLocal {
  /** Live photos marked `uploaded: false` whose images are on this phone. */
  toUpload(): Promise<PhotoUpload[]>;
  /** Sets `uploaded: true` (a normal edit, so the other phone learns it can download them). */
  markUploaded(id: string): Promise<void>;
  /** Deleted photos whose Storage objects were not removed yet (by this phone), with their format. */
  toPurge(): Promise<{ id: string; mime: PhotoMime }[]>;
  markPurged(id: string): Promise<void>;
}

/** `serverOutdated`: the server refuses a collection this version syncs (a migration in supabase/migrations/ was not run). */
export type SyncErrorCode = 'offline' | 'notFound' | 'full' | 'serverSetup' | 'serverOutdated' | 'failed';

export class SyncError extends Error {
  constructor(
    readonly code: SyncErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

/** One phone's push subscription, as saved on the sync server. */
export interface PushRegistration {
  endpoint: string;
  p256dh: string;
  auth: string;
  /** Who uses the phone, so night reminders reach whoever is on duty. */
  caregiverId: string;
  kinds: ReminderKind[];
  lang: 'mk' | 'en';
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
  /** Saves (or updates) this phone's push subscription for the family's reminders. */
  savePushSubscription(familyId: string, registration: PushRegistration): Promise<void>;
  deletePushSubscription(endpoint: string): Promise<void>;
  /** Asks the reminder function to send this phone a test notification. */
  sendTestPush(endpoint: string): Promise<void>;
  /** Photos in the family's private Storage bucket; `path` is relative to the family's folder. */
  uploadPhoto(familyId: string, path: string, blob: Blob, contentType: PhotoMime): Promise<void>;
  /** The image, or null when it is not (or no longer) in Storage. */
  downloadPhoto(familyId: string, path: string): Promise<Blob | null>;
  deletePhotos(familyId: string, paths: string[]): Promise<void>;
}
