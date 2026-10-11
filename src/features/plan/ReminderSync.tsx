import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { useToast } from '@/components/Toast';
import { useDevicePrefs } from '@/data/StoreContext';
import { showNotification } from '@/lib/notify';
import { useNow } from '@/lib/useNow';
import { reminderTime, upcomingItems, type UpcomingItem } from './logic';
import { useScopeLabel } from './shared';
import { useUpcomingData } from './useUpcoming';

const FIRED_KEY = 'twinsmk.reminders.fired';
const LOOKAHEAD_MS = 24 * 3600_000;
/** A reminder that comes due while the phone was asleep still fires if it is at most this late. */
const GRACE_MS = 10 * 60_000;

function loadFired(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function markFired(key: string) {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify([...loadFired(), key].slice(-200)));
  } catch {
    /* worst case a reminder repeats */
  }
}

/**
 * Schedules reminders for routine occurrences and appointments while the app
 * is open (or kept in memory). Each one shows an in-app toast and, if enabled
 * on this phone, a system notification. Without a push server nothing can fire
 * once the app is fully closed; Settings says so.
 */
export function ReminderSync() {
  const { t } = useTranslation();
  const toast = useToast();
  const prefs = useDevicePrefs();
  const scopeLabel = useScopeLabel();
  const raw = useUpcomingData();
  // Recompute every few minutes so new occurrences enter the look-ahead window.
  const now = useNow(5 * 60_000);
  const latest = useRef({ toast, t, scopeLabel, notify: false });
  // With push reminders on, the server sends the system notification; this only shows the in-app message.
  latest.current = { toast, t, scopeLabel, notify: Boolean(prefs?.notifications) && !prefs?.push };

  const items = useMemo(
    () => (raw ? upcomingItems({ ...raw, now, pastMs: GRACE_MS, aheadMs: LOOKAHEAD_MS, appointmentAheadMs: LOOKAHEAD_MS + 3600_000 }) : []),
    [raw, now],
  );

  useEffect(() => {
    const timers: number[] = [];
    const fire = (item: UpcomingItem) => {
      if (loadFired().includes(item.key)) return;
      markFired(item.key);
      const { toast: show, t: tr, scopeLabel: who, notify } = latest.current;
      const title =
        item.kind === 'appointment'
          ? tr('reminders.appointmentSoon', { title: item.title, time: format(item.at!, 'HH:mm') })
          : tr('reminders.routineDue', { title: item.title, who: who(item.babies) });
      show({ message: title });
      if (notify) void showNotification(title, item.location ?? '', item.key);
    };
    for (const item of items) {
      const at = reminderTime(item);
      if (!at) continue;
      const delay = at.getTime() - Date.now();
      if (delay < -GRACE_MS) continue;
      timers.push(window.setTimeout(() => fire(item), Math.max(0, delay)));
    }
    return () => timers.forEach((id) => clearTimeout(id));
  }, [items]);

  return null;
}
