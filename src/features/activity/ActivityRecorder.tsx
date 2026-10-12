import { useEffect } from 'react';
import { useStore } from '@/data/StoreContext';
import { useSyncEngine } from '@/data/sync/SyncContext';
import { PARENT_IDS } from '@/lib/caregivers';
import { fromOtherPhone } from '@/features/sync/changes';
import { KEEP_DAYS, KEEP_ENTRIES, incomingEntries } from './logic';

/**
 * Saves the changes sync brings in from other phones to this phone's notification
 * history (own changes are saved by the store as they are made). This runs whether
 * or not change alerts are on, so the history is complete either way.
 */
export function ActivityRecorder() {
  const store = useStore();
  const engine = useSyncEngine();

  useEffect(() => {
    void store.activity.prune(new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString(), KEEP_ENTRIES).catch(() => {});
  }, [store]);

  useEffect(
    () =>
      engine.onRemoteChanges(async ({ changes, catchUp }) => {
        // Joining a family merges everything at once: that is not news.
        if (catchUp) return;
        const prefs = await store.device.get();
        const news = fromOtherPhone(changes, prefs.deviceId);
        if (!news.length) return;
        const helpers = (await store.caregivers.list()).map((c) => c.id);
        await store.activity.add(incomingEntries(news, prefs.parent, [...PARENT_IDS, ...helpers]));
      }),
    [engine, store],
  );

  return null;
}
