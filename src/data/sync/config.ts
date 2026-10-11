import type { SyncRemote } from './types';

/**
 * The sync server, set at build time (see `.env.production` and the README).
 * Without it the app works exactly as before: local only, with backups.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** How to reach the sync server, or null when this build has none. */
export function syncConnector(): (() => Promise<SyncRemote>) | null {
  // `VITE_SUPABASE_URL=memory npm run dev` tries the sync screens without a server (one phone only).
  if (import.meta.env.DEV && url === 'memory') {
    return () => import('./memoryRemote').then((m) => new m.MemoryServer().client());
  }
  if (!url || !key) return null;
  // Loaded on demand, so the Supabase client is not part of the app's startup code.
  return () => import('./supabaseRemote').then((m) => m.createSupabaseRemote({ url, key }));
}
