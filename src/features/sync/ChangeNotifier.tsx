import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { useToast } from '@/components/Toast';
import { useDevicePrefs, useStore } from '@/data/StoreContext';
import { useSyncEngine } from '@/data/sync/SyncContext';
import { useDescribeEntry } from '@/features/log/describe';
import { useBabies, useTwinName } from '@/features/twins/twins';
import { dateLocale } from '@/i18n';
import { useLabel } from '@/lib/labels';
import { showNotification } from '@/lib/notify';
import { useParentName } from '@/lib/parents';
import { fromOtherPhone, summarizeChanges, type ChangeTextHelpers } from './changes';

/**
 * Tells this phone's user what the other parent changed, as soon as sync
 * brings it in: an in-app message while the app is on screen, a system
 * notification while it is in the background. Nothing can arrive once the
 * app is fully closed (that would need a push server).
 */
export function ChangeNotifier() {
  const { t, i18n } = useTranslation();
  const store = useStore();
  const engine = useSyncEngine();
  const toast = useToast();
  const prefs = useDevicePrefs();
  const describe = useDescribeEntry();
  const twin = useTwinName(useBabies());
  const label = useLabel();
  const parentName = useParentName();

  const latest = useRef({ t, i18n, toast, prefs, describe, twin, label, parentName });
  latest.current = { t, i18n, toast, prefs, describe, twin, label, parentName };

  useEffect(
    () =>
      engine.onRemoteChanges(async ({ changes, catchUp }) => {
        const { prefs: p, ...ctx } = latest.current;
        // Joining a family merges everything at once: that is not news.
        if (!p || catchUp || p.changeAlerts === false) return;
        const news = fromOtherPhone(changes, p.deviceId);
        if (!news.length) return;

        const routines = new Map((await store.routines.listAll()).map((r) => [r.id, r.title]));
        const locale = dateLocale(ctx.i18n.language);
        const helpers: ChangeTextHelpers = {
          t: ctx.t as unknown as ChangeTextHelpers['t'],
          entry: (e) => ctx.describe(e),
          twin: ctx.twin,
          label: ctx.label,
          routineTitle: (id) => routines.get(id),
          when: (iso) => format(new Date(iso), 'd MMM HH:mm', { locale }),
          parentName: ctx.parentName,
        };
        const summary = summarizeChanges(news, p.parent, helpers);
        if (!summary) return;

        if (document.visibilityState === 'visible') ctx.toast({ message: summary.toast });
        // Same tag, so a burst of changes replaces one notification instead of stacking up.
        else void showNotification(summary.title, summary.body, 'sync-changes');
      }),
    [engine, store],
  );

  return null;
}
