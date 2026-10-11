import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { splitMinutes } from '@/features/log/logic';

/** The current time, refreshed every `intervalMs` and whenever the app comes back to the foreground. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, intervalMs);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);
  return now;
}

/** "1 h 05 min" / "1 ч 05 мин", or "12 min". */
/** "just now" or "2 h 05 min ago" for a past moment. */
export function useFormatAgo(): (since: string | Date, now?: Date) => string {
  const { t } = useTranslation();
  const formatMinutes = useFormatMinutes();
  return useCallback(
    (since, now = new Date()) => {
      const minutes = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 60_000));
      return minutes < 1 ? t('today.justNow') : t('today.ago', { duration: formatMinutes(minutes) });
    },
    [t, formatMinutes],
  );
}

export function useFormatMinutes(): (minutes: number) => string {
  const { t } = useTranslation();
  return useCallback(
    (minutes) => {
      const { h, m } = splitMinutes(minutes);
      return h > 0 ? t('duration.hm', { h, m: String(m).padStart(2, '0') }) : t('duration.m', { m });
    },
    [t],
  );
}
