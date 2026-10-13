import { useEffect } from 'react';
import { useStore } from '@/data/StoreContext';
import { useSyncEngine } from '@/data/sync/SyncContext';
import { PARENT_IDS } from '@/lib/caregivers';
import { fromOtherPhone, withoutRoutineContractions } from '@/features/sync/changes';
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
        const entries = incomingEntries(news, prefs.parent, [...PARENT_IDS, ...helpers]);
        // Every contraction stays in the history, but only the announced ones count as unread.
        if (news.some((c) => c.collection === 'contractions')) {
          const announced = new Set(withoutRoutineContractions(news, await store.contractions.listAll()));
          entries.forEach((e, i) => {
            if (news[i].collection === 'contractions' && !announced.has(news[i])) e.seen = 1;
          });
        }
        // The mother's entries stay in the history, but do not count as unread unless they are announced.
        if (news.some((c) => c.collection === 'motherLogs') && !(await store.settings.get()).announceMother) {
          entries.forEach((e) => {
            if (e.collection === 'motherLogs') e.seen = 1;
          });
        }
        await store.activity.add(entries);
      }),
    [engine, store],
  );

  return null;
}
