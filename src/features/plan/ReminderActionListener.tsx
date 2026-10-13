import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/Toast';
import { useStore } from '@/data/StoreContext';
import { useSyncEngine } from '@/data/sync/SyncContext';
import { REMINDER_ACTION_MESSAGE, SYNC_NOW_MESSAGE } from '@/sw/reminderAction';
import { applyReminderAction, isReminderActionData } from './reminderActions';

/**
 * "Done" / "Snooze" pressed on a push reminder while the app is open: the service worker passes it
 * here, and the page writes it through its own store (so screens and sync see it at once).
 */
export function ReminderActionListener() {
  const { t } = useTranslation();
  const store = useStore();
  const engine = useSyncEngine();
  const toast = useToast();
  const latest = useRef({ t, toast });
  latest.current = { t, toast };

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const message = event.data as { type?: string; action?: string; data?: unknown } | null;
      if (message?.type === SYNC_NOW_MESSAGE) {
        void engine.syncNow().catch(() => undefined);
        return;
      }
      if (message?.type !== REMINDER_ACTION_MESSAGE || !isReminderActionData(message.data)) return;
      if (message.action !== 'done' && message.action !== 'snooze') return;
      const { data, action } = message;
      // The service worker waits for this answer; without "ok" it saves the action itself.
      const reply = (ok: boolean) => event.ports[0]?.postMessage({ ok });
      void (async () => {
        try {
          const { parent } = await store.device.get();
          await applyReminderAction(store, action, data, new Date(), parent);
          reply(true);
        } catch {
          reply(false);
          return;
        }
        const { t: tr, toast: show } = latest.current;
        show({ message: tr(action === 'done' ? 'reminders.doneToast' : 'reminders.snoozedToast', { title: data.title }) });
      })();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [store, engine]);

  return null;
}
