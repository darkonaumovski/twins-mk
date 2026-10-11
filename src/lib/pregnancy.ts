import { differenceInCalendarDays, parseISO, subDays, addDays, format } from 'date-fns';
import type { ISODate } from '@/data/types';

/** A full-term pregnancy is counted as 40 weeks (280 days) from the last menstrual period. */
export const TERM_DAYS = 280;

export interface PregnancyProgress {
  /** Days until the due date (negative once it has passed). */
  daysLeft: number;
  /** Completed weeks of pregnancy, e.g. 34 for "34+2". */
  week: number;
  /** Days into the current week, 0–6. */
  day: number;
}

export function pregnancyProgress(dueDate: ISODate, today: Date): PregnancyProgress {
  const daysLeft = differenceInCalendarDays(parseISO(dueDate), today);
  const elapsed = TERM_DAYS - daysLeft;
  return { daysLeft, week: Math.floor(elapsed / 7), day: ((elapsed % 7) + 7) % 7 };
}

/** The calendar date on which a given pregnancy week starts. */
export function dateOfWeek(dueDate: ISODate, week: number): ISODate {
  const start = subDays(parseISO(dueDate), TERM_DAYS);
  return format(addDays(start, week * 7), 'yyyy-MM-dd');
}
