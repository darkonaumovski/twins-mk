import { incomingWins } from '../merge';
import { newId } from '@/lib/ids';
import { normalizeCode } from './engine';
import { SyncError, type PushRegistration, type RemoteChange, type SyncChange, type SyncMembership, type SyncRemote } from './types';

interface StoredRow extends RemoteChange {
  familyId: string;
}

/**
 * An in-memory stand-in for the Supabase backend, with the same rules as
 * supabase/schema.sql (newest version wins, change numbers, members only).
 * Used by tests to run two phones against one "server".
 */
export class MemoryServer {
  private readonly families = new Map<string, { code: string; members: Set<string> }>();
  private readonly rows = new Map<string, StoredRow>();
  private readonly listeners = new Set<{ familyId: string; client: MemoryRemote; onChange: () => void }>();
  private seq = 0;
  /** Push subscriptions by endpoint (nothing is sent: there is no push service here). */
  readonly pushSubscriptions = new Map<string, PushRegistration & { familyId: string; userId: string }>();

  /** A connection for one signed-in phone. */
  client(userId = newId()) {
    return new MemoryRemote(this, userId);
  }

  /** @internal */ createFamily(userId: string): SyncMembership {
    const familyId = newId();
    const code = newId().replace(/-/g, '').slice(0, 12).toUpperCase();
    this.families.set(familyId, { code, members: new Set([userId]) });
    return { familyId, code };
  }

  /** @internal */ joinFamily(userId: string, code: string) {
    for (const [familyId, family] of this.families) {
      if (family.code === normalizeCode(code)) {
        family.members.add(userId);
        return familyId;
      }
    }
    throw new SyncError('notFound');
  }

  /** @internal */ leaveFamily(userId: string, familyId: string) {
    this.families.get(familyId)?.members.delete(userId);
  }

  /** @internal */ assertMember(userId: string, familyId: string) {
    if (!this.families.get(familyId)?.members.has(userId)) throw new SyncError('failed', 'not_a_member');
  }

  /** @internal */ push(familyId: string, changes: SyncChange[]) {
    let applied = 0;
    for (const { collection, record } of changes) {
      const key = `${familyId}/${collection}/${record.id}`;
      const existing = this.rows.get(key);
      if (existing && !incomingWins(existing.record, record)) continue;
      this.rows.set(key, { familyId, collection, record: structuredClone(record), seq: ++this.seq });
      applied++;
    }
    if (applied) {
      for (const l of this.listeners) {
        if (l.familyId === familyId && l.client.online) setTimeout(l.onChange, 0);
      }
    }
  }

  /** @internal */ pull(familyId: string, after: number, limit: number): RemoteChange[] {
    return [...this.rows.values()]
      .filter((r) => r.familyId === familyId && r.seq > after)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit)
      .map(({ collection, record, seq }) => ({ collection, record: structuredClone(record), seq }));
  }

  /** @internal */ listen(entry: { familyId: string; client: MemoryRemote; onChange: () => void }) {
    this.listeners.add(entry);
    return () => this.listeners.delete(entry);
  }
}

export class MemoryRemote implements SyncRemote {
  /** Set to false to simulate a phone without internet. */
  online = true;
  private readonly liveHandlers = new Set<(live: boolean) => void>();

  constructor(
    private readonly server: MemoryServer,
    readonly userId: string,
  ) {}

  setOnline(online: boolean) {
    this.online = online;
    this.liveHandlers.forEach((h) => h(online));
  }

  private async call<T>(fn: () => T): Promise<T> {
    await Promise.resolve();
    if (!this.online) throw new SyncError('offline');
    return fn();
  }

  createFamily() {
    return this.call(() => this.server.createFamily(this.userId));
  }

  joinFamily(code: string) {
    return this.call(() => this.server.joinFamily(this.userId, code));
  }

  leaveFamily(familyId: string) {
    return this.call(() => this.server.leaveFamily(this.userId, familyId));
  }

  push(familyId: string, changes: SyncChange[]) {
    return this.call(() => {
      this.server.assertMember(this.userId, familyId);
      this.server.push(familyId, changes);
    });
  }

  pull(familyId: string, after: number, limit: number) {
    return this.call(() => {
      this.server.assertMember(this.userId, familyId);
      return this.server.pull(familyId, after, limit);
    });
  }

  savePushSubscription(familyId: string, registration: PushRegistration) {
    return this.call(() => {
      this.server.assertMember(this.userId, familyId);
      this.server.pushSubscriptions.set(registration.endpoint, { ...registration, familyId, userId: this.userId });
    });
  }

  deletePushSubscription(endpoint: string) {
    return this.call(() => {
      if (this.server.pushSubscriptions.get(endpoint)?.userId === this.userId) this.server.pushSubscriptions.delete(endpoint);
    });
  }

  sendTestPush(endpoint: string) {
    return this.call(() => {
      if (this.server.pushSubscriptions.get(endpoint)?.userId !== this.userId) throw new SyncError('failed', 'no_subscription');
    });
  }

  listen(familyId: string, handlers: { onChange: () => void; onLive: (live: boolean) => void }) {
    const stop = this.server.listen({ familyId, client: this, onChange: handlers.onChange });
    this.liveHandlers.add(handlers.onLive);
    setTimeout(() => handlers.onLive(this.online), 0);
    return () => {
      stop();
      this.liveHandlers.delete(handlers.onLive);
    };
  }
}
