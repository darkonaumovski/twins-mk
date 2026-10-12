import type { DoctorNote, ISODate, LogEntry, TwinSlot } from '@/data/types';
import { EMPTY_SUMMARY, localDay, summarize, type DaySummary } from '@/features/history/summary';
import { slotsFor } from '@/features/plan/logic';

export interface ReportDay {
  date: ISODate;
  summary: DaySummary;
}

/** One row per day for one twin. `entries` should include the day before the first (sleep across midnight). */
export function reportRows(entries: readonly LogEntry[], babyId: string, days: readonly ISODate[], now: Date): ReportDay[] {
  return days.map((date) => {
    const { from, to } = localDay(date);
    return { date, summary: summarize(entries, babyId, from, to, now) };
  });
}

/** Totals over the period (sums; the table shows averages per day next to them). */
export function reportTotals(rows: readonly ReportDay[]): DaySummary {
  const total = { ...EMPTY_SUMMARY };
  for (const { summary } of rows) {
    for (const key of Object.keys(total) as (keyof DaySummary)[]) total[key] += summary[key];
  }
  return total;
}

/**
 * Notes still to discuss that concern one of these twins. Notes for the mother (`babies: 'none'`)
 * only when the report's "Include notes for the mother" switch is on.
 */
export function openNotesFor(notes: readonly DoctorNote[], slots: readonly TwinSlot[], includeMother = false): DoctorNote[] {
  return notes
    .filter((n) => n.deletedAt === null && n.reviewedAt === null)
    .filter((n) => (n.babies === 'none' ? includeMother : slotsFor(n.babies).some((s) => slots.includes(s))))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
