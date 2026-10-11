import { isEntity } from '../merge';
import { COLLECTIONS, type CollectionName } from '../repository';
import type { Entity } from '../types';
import {
  SyncError,
  type AppliedChange,
  type PushRegistration,
  type SyncErrorCode,
  type SyncLocal,
  type SyncMembership,
  type SyncRemote,
} from './types';

export type SyncState = 'off' | 'connecting' | 'synced' | 'offline' | 'error';

export interface SyncSnapshot {
  state: SyncState;
  /** Why the last attempt failed (`state` is `offline` or `error`). */
  error: SyncErrorCode | null;
  /** Changes on this phone not yet on the server. */
  pending: number;
  /** True while the real-time connection is up, so changes arrive within a second or two. */
  live: boolean;
  lastSyncAt: string | null;
}

export interface RemoteUpdate {
  /** Records that changed on this phone, with the version each one replaced. */
  changes: AppliedChange[];
  /** True for the first download after joining a family: a merge, not news. */
  catchUp: boolean;
}

export interface SyncEngineOptions {
  /** Wait this long after a change before syncing, so a burst of edits goes up together. */
  debounceMs?: number;
  /** How often to check the server when the real-time connection is down. */
  pollMs?: number;
  /** Longest wait between retries after a failure. */
  maxRetryMs?: number;
  now?: () => Date;
}

const BATCH = 500;
/** Even with a live connection, check in now and then in case an event was missed. */
const SAFETY_PULL_MS = 5 * 60_000;

/**
 * Keeps this phone's local data and the family's server copy in step.
 *
 * Local edits go into an outbox and are pushed; the server keeps the newest
 * version of every record. Changes from the other phone are pulled by change
 * number (`seq`) and merged with the same newest-wins rule. A real-time
 * subscription triggers a pull as soon as the other phone writes, and
 * everything still works (later) when either phone is offline.
 */
export class SyncEngine {
  private snapshot: SyncSnapshot = { state: 'off', error: null, pending: 0, live: false, lastSyncAt: null };
  private readonly listeners = new Set<() => void>();
  private readonly opts: Required<SyncEngineOptions>;

  private membership: SyncMembership | null = null;
  /** Bumped on start and stop, so work from an earlier session is dropped. */
  private generation = 0;
  private remotePromise: Promise<SyncRemote> | null = null;
  private joined = false;
  private running: Promise<void> | null = null;
  private again = false;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 0;
  private cleanups: (() => void)[] = [];
  private unlisten: (() => void) | null = null;

  constructor(
    private readonly local: SyncLocal,
    private readonly connect: (() => Promise<SyncRemote>) | null,
    options: SyncEngineOptions = {},
  ) {
    this.opts = { debounceMs: 400, pollMs: 30_000, maxRetryMs: 60_000, now: () => new Date(), ...options };
  }

  /** False when this build has no sync server configured. */
  get available() {
    return this.connect !== null;
  }

  // ---------- Observable state (for useSyncExternalStore) ----------

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private readonly changeListeners = new Set<(update: RemoteUpdate) => void>();

  /** Called after downloaded changes were saved on this phone. */
  onRemoteChanges(listener: (update: RemoteUpdate) => void) {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  private set(patch: Partial<SyncSnapshot>) {
    const next = { ...this.snapshot, ...patch };
    if ((Object.keys(patch) as (keyof SyncSnapshot)[]).every((k) => next[k] === this.snapshot[k])) return;
    this.snapshot = next;
    this.listeners.forEach((l) => l());
  }

  // ---------- Family membership ----------

  private remote(): Promise<SyncRemote> {
    if (!this.connect) return Promise.reject(new SyncError('serverSetup', 'no sync server configured'));
    this.remotePromise ??= this.connect().catch((err) => {
      this.remotePromise = null;
      throw err;
    });
    return this.remotePromise;
  }

  /** Creates a new family on the server. The caller stores the membership, which starts syncing. */
  async createFamily(): Promise<SyncMembership> {
    const membership = await (await this.remote()).createFamily();
    await this.local.reset();
    await this.local.enqueueAll();
    return membership;
  }

  /** Joins the other parent's family. This phone's data is merged with the family's. */
  async joinFamily(code: string): Promise<SyncMembership> {
    const familyId = await (await this.remote()).joinFamily(code);
    await this.local.reset();
    await this.local.enqueueAll();
    return { familyId, code: normalizeCode(code) };
  }

  /** Stops syncing on this phone. Local data stays. */
  async leave(membership: SyncMembership) {
    this.stop();
    await this.local.reset();
    try {
      await (await this.remote()).leaveFamily(membership.familyId);
    } catch {
      // Offline or already gone: the phone stops syncing either way.
    }
  }

  // ---------- Push reminders ----------

  /** Saves this phone's push subscription with the family it syncs with. */
  async savePush(membership: SyncMembership, registration: PushRegistration) {
    await (await this.remote()).savePushSubscription(membership.familyId, registration);
  }

  async deletePush(endpoint: string) {
    await (await this.remote()).deletePushSubscription(endpoint);
  }

  async testPush(endpoint: string) {
    await (await this.remote()).sendTestPush(endpoint);
  }

  // ---------- Running ----------

  start(membership: SyncMembership) {
    if (this.membership?.familyId === membership.familyId) return;
    this.stop();
    if (!this.connect) return;
    this.membership = membership;
    this.generation++;
    this.joined = false;
    this.set({ state: 'connecting', error: null, live: false });

    this.cleanups.push(
      this.local.watchPending((pending) => {
        this.set({ pending });
        if (pending > 0) this.schedule(this.opts.debounceMs);
      }),
    );

    const poll = setInterval(() => {
      if (isHidden()) return;
      const last = this.snapshot.lastSyncAt ? Date.parse(this.snapshot.lastSyncAt) : 0;
      if (!this.snapshot.live || this.opts.now().getTime() - last > SAFETY_PULL_MS) void this.syncNow();
    }, this.opts.pollMs);
    this.cleanups.push(() => clearInterval(poll));

    if (typeof window !== 'undefined') {
      const wake = () => {
        if (!isHidden()) void this.syncNow();
      };
      window.addEventListener('online', wake);
      document.addEventListener('visibilitychange', wake);
      this.cleanups.push(() => {
        window.removeEventListener('online', wake);
        document.removeEventListener('visibilitychange', wake);
      });
    }

    void this.syncNow();
  }

  stop() {
    this.generation++;
    this.membership = null;
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
    this.unlisten?.();
    this.unlisten = null;
    if (this.debounce) clearTimeout(this.debounce);
    if (this.retry) clearTimeout(this.retry);
    this.debounce = this.retry = null;
    this.retryDelay = 0;
    this.set({ state: 'off', error: null, live: false });
  }

  private schedule(ms: number) {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.debounce = null;
      void this.syncNow();
    }, ms);
  }

  /** Pushes and pulls now. Resolves when this phone is up to date (or the attempt failed). */
  syncNow(): Promise<void> {
    if (!this.membership) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.loop().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async loop() {
    const generation = this.generation;
    const membership = this.membership!;
    const current = () => generation === this.generation;
    try {
      do {
        this.again = false;
        const remote = await this.remote();
        if (!current()) return;
        if (!this.joined) {
          // Cheap and idempotent; also restores access if this phone's sign-in was lost.
          await remote.joinFamily(membership.code);
          this.joined = true;
        }
        await this.push(remote, membership.familyId, current);
        await this.pull(remote, membership.familyId, current);
        if (!current()) return;
        this.unlisten ??= remote.listen(membership.familyId, {
          onChange: () => {
            if (current()) this.schedule(150);
          },
          onLive: (live) => {
            if (!current()) return;
            this.set({ live });
            // Catch up on anything missed while the connection was down.
            if (live) void this.syncNow();
          },
        });
      } while (this.again && current());
      if (!current()) return;
      this.retryDelay = 0;
      this.set({ state: 'synced', error: null, lastSyncAt: this.opts.now().toISOString() });
    } catch (err) {
      if (!current()) return;
      const code = err instanceof SyncError ? err.code : 'failed';
      if (code !== 'offline') console.warn('Sync failed', err);
      this.set({ state: code === 'offline' ? 'offline' : 'error', error: code });
      // A missing family will not come back; everything else is worth retrying.
      if (code !== 'notFound') {
        this.retryDelay = Math.min(this.opts.maxRetryMs, Math.max(2000, this.retryDelay * 2));
        if (this.retry) clearTimeout(this.retry);
        this.retry = setTimeout(() => {
          this.retry = null;
          void this.syncNow();
        }, this.retryDelay);
      }
    }
  }

  private async push(remote: SyncRemote, familyId: string, current: () => boolean) {
    // Bounded, in case the user keeps editing faster than uploads finish.
    for (let round = 0; round < 50 && current(); round++) {
      const pending = await this.local.pending();
      if (!pending.length) return;
      const batch = pending.slice(0, BATCH);
      const changes = await this.local.read(batch);
      if (changes.length) await remote.push(familyId, changes);
      if (!current()) return;
      await this.local.acknowledge(batch);
    }
  }

  private async pull(remote: SyncRemote, familyId: string, current: () => boolean) {
    let cursor = await this.local.getCursor();
    const catchUp = cursor === 0;
    const applied: AppliedChange[] = [];
    try {
      await this.pullPages(remote, familyId, current, cursor, applied);
    } finally {
      // Report even a partial pull: those records are already on screen.
      if (applied.length && current()) {
        const update = { changes: applied, catchUp };
        this.changeListeners.forEach((l) => l(update));
      }
    }
  }

  private async pullPages(remote: SyncRemote, familyId: string, current: () => boolean, cursor: number, applied: AppliedChange[]) {
    for (;;) {
      const changes = await remote.pull(familyId, cursor, BATCH);
      if (!current() || !changes.length) return;
      const byCollection = new Map<CollectionName, Entity[]>();
      for (const c of changes) {
        // Skip anything this version does not understand rather than storing it.
        if (!COLLECTIONS.includes(c.collection) || !isEntity(c.record)) continue;
        byCollection.set(c.collection, [...(byCollection.get(c.collection) ?? []), c.record]);
      }
      for (const [collection, records] of byCollection) applied.push(...(await this.local.applyRemote(collection, records)));
      cursor = changes[changes.length - 1].seq;
      await this.local.setCursor(cursor);
      if (changes.length < BATCH) return;
    }
  }
}

function isHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/** `abcd-efgh ijkl` → `ABCDEFGHIJKL`. */
export function normalizeCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** `ABCDEFGHIJKL` → `ABCD-EFGH-IJKL`, easier to read out and type. */
export function formatCode(code: string) {
  return normalizeCode(code).replace(/(.{4})(?=.)/g, '$1-');
}
