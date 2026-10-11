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

/** The checklist aims to have the must-haves ready by this week, because twins often arrive early. */
export const READY_BY_WEEK = 32;

export interface Countdown {
  /** What the countdown counts to: the planned delivery date if one is set, otherwise the due date. */
  target: 'delivery' | 'due';
  /** Days until the target (negative once it has passed). */
  daysLeft: number;
  /** Pregnancy week and day, always counted from the due date. */
  progress: PregnancyProgress | null;
}

export function countdown(dueDate: ISODate | null, expectedDelivery: ISODate | null, today: Date): Countdown | null {
  const progress = dueDate ? pregnancyProgress(dueDate, today) : null;
  if (expectedDelivery) {
    return { target: 'delivery', daysLeft: differenceInCalendarDays(parseISO(expectedDelivery), today), progress };
  }
  if (progress) return { target: 'due', daysLeft: progress.daysLeft, progress };
  return null;
}

/** The calendar date on which a given pregnancy week starts. */
export function dateOfWeek(dueDate: ISODate, week: number): ISODate {
  const start = subDays(parseISO(dueDate), TERM_DAYS);
  return format(addDays(start, week * 7), 'yyyy-MM-dd');
}
