import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { endOfDay, addDays, format, isSameDay } from 'date-fns';
import { CalendarDays, Check, ListTodo, Repeat, type LucideIcon } from 'lucide-react';
import { cx } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useStore } from '@/data/StoreContext';
import { dateLocale } from '@/i18n';
import { formatShortDate } from '@/lib/format';
import { useFormatMinutes } from '@/lib/useNow';
import { minutesBetween } from '@/features/log/logic';
import type { UpcomingItem } from './logic';
import { ScopeBadges } from './shared';
import { useUpcoming } from './useUpcoming';

const ICONS: Record<UpcomingItem['kind'], LucideIcon> = { routine: Repeat, appointment: CalendarDays, task: ListTodo };
const MAX_ITEMS = 6;

/** "Coming up" on Today: routines due in the next hours, appointments until tomorrow night, tasks due. */
export function UpcomingSection({ now }: { now: Date }) {
  const { t, i18n } = useTranslation();
  const store = useStore();
  const toast = useToast();
  const fmt = useFormatMinutes();
  const items = useUpcoming(now, {
    pastMs: 12 * 3600_000,
    aheadMs: 12 * 3600_000,
    appointmentAheadMs: endOfDay(addDays(now, 1)).getTime() - now.getTime(),
  });
  if (!items || items.length === 0) return null;

  const when = (item: UpcomingItem) => {
    if (!item.at) return { text: formatShortDate(item.due!, i18n.language), overdue: true };
    const diff = item.at.getTime() - now.getTime();
    const minutes = minutesBetween(now, item.at) || minutesBetween(item.at, now);
    const time = isSameDay(item.at, now) ? format(item.at, 'HH:mm') : format(item.at, 'EEE HH:mm', { locale: dateLocale(i18n.language) });
    if (Math.abs(diff) < 60_000) return { text: `${time} · ${t('upcoming.now')}`, overdue: false };
    return diff > 0
      ? { text: `${time} · ${t('upcoming.in', { duration: fmt(minutes) })}`, overdue: false }
      : { text: `${time} · ${t('upcoming.overdue', { duration: fmt(minutes) })}`, overdue: true };
  };

  const markRoutine = async (item: UpcomingItem) => {
    const created = await store.routineDone.create({ routineId: item.id, occurrence: item.occurrence! });
    toast({
      message: t('upcoming.marked', { title: item.title }),
      action: { label: t('common.undo'), onClick: () => void store.routineDone.remove(created.id) },
    });
  };
  const markTask = async (item: UpcomingItem) => {
    await store.tasks.update(item.id, { done: true });
    toast({
      message: t('upcoming.marked', { title: item.title }),
      action: { label: t('common.undo'), onClick: () => void store.tasks.update(item.id, { done: false }) },
    });
  };

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-semibold tracking-wide text-muted uppercase">{t('upcoming.title')}</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {items.slice(0, MAX_ITEMS).map((item) => {
          const Icon = ICONS[item.kind];
          const w = when(item);
          const canMark = (item.kind === 'routine' && item.occurrence) || item.kind === 'task';
          const body = (
            <>
              <Icon aria-hidden size={20} className={cx('shrink-0', w.overdue ? 'text-danger' : 'text-accent')} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-medium">
                  <ScopeBadges scope={item.babies} kind={item.kind === 'appointment' ? 'appointment' : 'routine'} />
                  <span className="truncate">{item.title}</span>
                </span>
                <span className={cx('block text-sm', w.overdue ? 'font-semibold text-danger' : 'text-muted')}>
                  {w.text}
                  {item.location && ` · ${item.location}`}
                </span>
              </span>
            </>
          );
          return (
            <li key={item.key} className="flex items-center gap-2 pr-2">
              {item.kind === 'routine' ? (
                <div className="flex min-h-14 flex-1 items-center gap-3 py-2 pl-4">{body}</div>
              ) : (
                <Link to={item.kind === 'task' ? '/plan?tab=tasks' : '/plan'} className="flex min-h-14 flex-1 items-center gap-3 py-2 pl-4">
                  {body}
                </Link>
              )}
              {canMark && (
                <button
                  type="button"
                  onClick={() => (item.kind === 'task' ? markTask(item) : markRoutine(item))}
                  aria-label={t('upcoming.markDone', { title: item.title })}
                  className="flex min-h-11 items-center gap-1 rounded-full border-2 border-ok px-3 text-sm font-semibold text-ok hover:bg-ok hover:text-surface"
                >
                  <Check aria-hidden size={16} strokeWidth={3} />
                  {t('upcoming.done')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
