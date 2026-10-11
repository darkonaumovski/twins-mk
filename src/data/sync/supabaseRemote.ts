import type { SupabaseClient } from '@supabase/supabase-js';
import { COLLECTIONS, type CollectionName } from '../repository';
import type { Entity } from '../types';
import { SyncError, type RemoteChange, type SyncChange, type SyncMembership, type SyncRemote } from './types';

export interface SupabaseConfig {
  url: string;
  /** The project's public "anon" / publishable key; access is limited by the rules in supabase/schema.sql. */
  key: string;
}

/** Turns Supabase errors into the few cases the app explains to people. */
function toSyncError(error: { message?: string; code?: string } | null | undefined): SyncError {
  const message = error?.message ?? '';
  const code = error?.code ?? '';
  if (
    (typeof navigator !== 'undefined' && navigator.onLine === false) ||
    /failed to fetch|load failed|network|fetch failed/i.test(message)
  ) {
    return new SyncError('offline', message);
  }
  if (message.includes('family_not_found')) return new SyncError('notFound');
  if (message.includes('family_full')) return new SyncError('full');
  // A collection the server does not list yet (a migration in supabase/migrations/ was not run):
  // the foreign key to sync_collections, or the fixed list of a project set up before it.
  if (
    (code === '23503' && message.includes('records_collection_fkey')) ||
    (code === '23514' && message.includes('records_collection_check'))
  ) {
    return new SyncError('serverOutdated', message);
  }
  // Anonymous sign-ins switched off, or schema.sql not run yet.
  if (code === 'anonymous_provider_disabled' || code === 'PGRST202' || code === 'PGRST205' || code === '42P01') {
    return new SyncError('serverSetup', `${code} ${message}`);
  }
  return new SyncError('failed', `${code} ${message}`.trim());
}

/**
 * The sync server on Supabase. Each phone signs in anonymously (the sign-in
 * is remembered on the phone); being a member of a family is what grants
 * access to its records.
 */
export async function createSupabaseRemote(config: SupabaseConfig): Promise<SyncRemote> {
  const { createClient } = await import('@supabase/supabase-js');
  const client: SupabaseClient = createClient(config.url, config.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'twinsmk.sync.auth' },
  });

  let session: Promise<void> | null = null;
  const signedIn = () => {
    session ??= (async () => {
      const { data, error } = await client.auth.getSession();
      if (error) throw toSyncError(error);
      if (data.session) return;
      const signIn = await client.auth.signInAnonymously();
      if (signIn.error) throw toSyncError(signIn.error);
    })().catch((err: unknown) => {
      session = null;
      throw err instanceof SyncError ? err : toSyncError(err as Error);
    });
    return session;
  };

  const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    await signedIn();
    try {
      const { data, error } = await client.rpc(fn, args);
      if (error) throw toSyncError(error);
      return data as T;
    } catch (err) {
      throw err instanceof SyncError ? err : toSyncError(err as Error);
    }
  };

  return {
    async createFamily(): Promise<SyncMembership> {
      const rows = await rpc<{ family_id: string; join_code: string }[]>('create_family', {});
      const row = rows?.[0];
      if (!row) throw new SyncError('failed', 'create_family returned nothing');
      return { familyId: row.family_id, code: row.join_code };
    },

    joinFamily: (code) => rpc<string>('join_family', { code }),

    async leaveFamily(familyId) {
      await rpc('leave_family', { f: familyId });
    },

    async push(familyId, changes: SyncChange[]) {
      await rpc('push_records', { f: familyId, rows: changes.map((c) => ({ collection: c.collection, data: c.record })) });
    },

    async pull(familyId, after, limit): Promise<RemoteChange[]> {
      await signedIn();
      try {
        const { data, error } = await client
          .from('records')
          .select('collection, data, seq')
          .eq('family_id', familyId)
          .gt('seq', after)
          .order('seq', { ascending: true })
          .limit(limit);
        if (error) throw toSyncError(error);
        return (data as { collection: string; data: Entity; seq: number | string }[])
          .filter((r) => COLLECTIONS.includes(r.collection as CollectionName))
          .map((r) => ({ collection: r.collection as CollectionName, record: r.data, seq: Number(r.seq) }));
      } catch (err) {
        throw err instanceof SyncError ? err : toSyncError(err as Error);
      }
    },

    listen(familyId, { onChange, onLive }) {
      let stopped = false;
      let channel: ReturnType<SupabaseClient['channel']> | null = null;
      void signedIn()
        .then(async () => {
          if (stopped) return;
          const { data } = await client.auth.getSession();
          if (data.session) await client.realtime.setAuth(data.session.access_token);
          if (stopped) return;
          channel = client
            .channel(`family:${familyId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `family_id=eq.${familyId}` }, () =>
              onChange(),
            )
            // The client reconnects by itself after drops; each SUBSCRIBED is followed by a catch-up pull.
            .subscribe((status) => onLive(status === 'SUBSCRIBED'));
        })
        .catch(() => onLive(false));
      return () => {
        stopped = true;
        if (channel) void client.removeChannel(channel);
      };
    },
  };
}
