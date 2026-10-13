import { format } from 'date-fns';
import type { ISODate } from '@/data/types';

/** Today's local date, `YYYY-MM-DD`. Kept free of i18n, so the service worker and the push function can use it. */
export function todayISO(now = new Date()): ISODate {
  return format(now, 'yyyy-MM-dd');
}
