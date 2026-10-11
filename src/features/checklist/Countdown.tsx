import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AlertTriangle, Baby, CalendarHeart, ChevronRight } from 'lucide-react';
import { ProgressBar } from '@/components/ProgressBar';
import { pregnancyProgress } from '@/lib/pregnancy';
import type { ISODate } from '@/data/types';
import type { Progress } from './logic';

export function Countdown({
  dueDate,
  overall,
  overdueCount,
  overdueActive,
  onToggleOverdue,
  showArrived,
}: {
  dueDate: ISODate | null;
  overall: Progress;
  overdueCount: number;
  overdueActive: boolean;
  onToggleOverdue: () => void;
  /** Offer the switch to the planner (only before birth). */
  showArrived: boolean;
}) {
  const { t } = useTranslation();
  const p = dueDate ? pregnancyProgress(dueDate, new Date()) : null;

  return (
    <section className="space-y-4 rounded-3xl bg-accent-soft p-5">
      {p ? (
        <div className="flex items-end justify-between gap-3">
          <p className="text-2xl leading-tight font-bold">
            {p.daysLeft > 0
              ? t('countdown.daysLeft', { count: p.daysLeft })
              : p.daysLeft === 0
                ? t('countdown.dueToday')
                : t('countdown.pastDue', { count: -p.daysLeft })}
          </p>
          {p.daysLeft >= 0 && <p className="shrink-0 font-semibold text-accent">{t('countdown.week', { week: p.week, day: p.day })}</p>}
        </div>
      ) : (
        <p className="flex items-start gap-3">
          <CalendarHeart aria-hidden className="mt-0.5 shrink-0 text-accent" size={22} />
          <span>
            {t('countdown.noDueDate')}{' '}
            <Link to="/settings" className="font-semibold text-accent underline underline-offset-2">
              {t('common.openSettings')}
            </Link>
          </span>
        </p>
      )}

      <div className="space-y-1.5">
        <p className="flex justify-between text-sm font-medium">
          <span>{t('checklist.overall', { ...overall })}</span>
          <span>{overall.total ? Math.round((overall.done / overall.total) * 100) : 0}%</span>
        </p>
        <ProgressBar value={overall.done} max={overall.total} label={t('checklist.overall', { ...overall })} className="bg-surface!" />
      </div>

      {showArrived && (
        <Link to="/setup" className="flex min-h-14 items-center gap-3 rounded-2xl bg-surface px-4 py-2">
          <Baby aria-hidden size={24} className="shrink-0 text-accent" />
          <span className="flex-1">
            <span className="block font-semibold">{t('twins.arrived')}</span>
            <span className="block text-sm text-muted">{t('twins.arrivedHint')}</span>
          </span>
          <ChevronRight aria-hidden size={20} className="shrink-0 text-muted" />
        </Link>
      )}

      {overdueCount > 0 && (
        <button
          type="button"
          onClick={onToggleOverdue}
          aria-pressed={overdueActive}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-danger/40 bg-surface px-4 text-sm font-semibold text-danger aria-pressed:bg-danger aria-pressed:text-surface"
        >
          <AlertTriangle aria-hidden size={16} />
          {t('checklist.overdueCount', { count: overdueCount })}
        </button>
      )}
    </section>
  );
}
