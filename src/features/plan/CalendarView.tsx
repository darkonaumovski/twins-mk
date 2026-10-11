import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, MapPin, NotebookPen, Plus } from 'lucide-react';
import { Button, IconButton } from '@/components/Button';
import { cx } from '@/components/ui';
import { useLive } from '@/data/StoreContext';
import { dateLocale } from '@/i18n';
import { todayISO } from '@/lib/format';
import type { Appointment, ISODate } from '@/data/types';
import { AppointmentEditor } from './AppointmentEditor';
import { ScopeBadges } from './shared';

/** 09:00 on the chosen day, or the next full hour if that is today and 09:00 has passed. */
function defaultStartFor(day: ISODate): string {
  const nineAm = parseISO(`${day}T09:00`);
  if (nineAm.getTime() > Date.now()) return nineAm.toISOString();
  const next = new Date();
  next.setHours(next.getHours() + 1, 0, 0, 0);
  return (day === todayISO() ? next : nineAm).toISOString();
}

function AppointmentRow({ appt, onOpen, showDate }: { appt: Appointment; onOpen: () => void; showDate?: boolean }) {
  const { i18n } = useTranslation();
  const start = new Date(appt.start);
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-4 py-3 text-left">
      <span className="w-14 shrink-0 text-center">
        {showDate && (
          <span className="block text-xs font-medium text-muted uppercase">
            {format(start, 'd MMM', { locale: dateLocale(i18n.language) })}
          </span>
        )}
        <span className="block font-semibold tabular-nums">{format(start, 'HH:mm')}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-medium">
          <ScopeBadges scope={appt.babies} />
          <span className="truncate">{appt.title}</span>
        </span>
        {appt.location && (
          <span className="mt-0.5 flex items-center gap-1 text-sm text-muted">
            <MapPin aria-hidden size={14} />
            <span className="truncate">{appt.location}</span>
          </span>
        )}
        {appt.notes && <span className="mt-0.5 block truncate text-sm text-muted">{appt.notes}</span>}
      </span>
    </button>
  );
}

export function CalendarView() {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.language);
  const today = todayISO();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<ISODate>(today);
  const [editing, setEditing] = useState<Appointment | 'new' | null>(null);
  const data = useLive(async (s) => {
    const [appointments, notes] = await Promise.all([s.appointments.list(), s.doctorNotes.list()]);
    appointments.sort((a, b) => a.start.localeCompare(b.start));
    return { appointments, openNotes: notes.filter((n) => n.reviewedAt === null).length };
  }, []);

  const byDay = new Map<ISODate, Appointment[]>();
  for (const a of data?.appointments ?? []) {
    const key = format(new Date(a.start), 'yyyy-MM-dd');
    byDay.set(key, [...(byDay.get(key) ?? []), a]);
  }

  // Weeks start on Monday in Macedonia (and in en-GB).
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  const weekdays = days.slice(0, 7).map((d) => format(d, 'EEEEEE', { locale }));

  const upcoming = (data?.appointments ?? []).filter((a) => new Date(a.start).getTime() >= Date.now() - 3600_000).slice(0, 10);
  const onSelected = byDay.get(selected) ?? [];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-surface p-3">
        <div className="mb-2 flex items-center gap-1">
          <IconButton label={t('appt.prevMonth')} onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeft aria-hidden size={22} />
          </IconButton>
          <h2 className="flex-1 text-center font-semibold capitalize" aria-live="polite">
            {format(month, 'LLLL yyyy', { locale })}
          </h2>
          <IconButton label={t('appt.nextMonth')} onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight aria-hidden size={22} />
          </IconButton>
        </div>
        <div className="grid grid-cols-7 text-center text-xs font-medium text-muted" aria-hidden>
          {weekdays.map((w, i) => (
            <span key={i} className="py-1">
              {w}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5" role="group" aria-label={format(month, 'LLLL yyyy', { locale })}>
          {days.map((d) => {
            const key = format(d, 'yyyy-MM-dd');
            const count = byDay.get(key)?.length ?? 0;
            const isSelected = key === selected;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                aria-pressed={isSelected}
                aria-label={`${format(d, 'PPPP', { locale })}${count ? `, ${t('appt.hasAppointments')}` : ''}`}
                className={cx(
                  'flex min-h-11 flex-col items-center justify-center rounded-xl text-sm tabular-nums',
                  !isSameMonth(d, month) && 'text-muted/60',
                  isSelected
                    ? 'bg-accent font-semibold text-on-accent'
                    : key === today
                      ? 'font-semibold ring-2 ring-accent ring-inset'
                      : 'hover:bg-surface-2',
                )}
              >
                {format(d, 'd')}
                <span
                  aria-hidden
                  className={cx('mt-0.5 size-1.5 rounded-full', count ? (isSelected ? 'bg-on-accent' : 'bg-accent') : 'bg-transparent')}
                />
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="font-semibold">{format(parseISO(selected), 'EEEE d MMMM', { locale })}</h2>
          <Button variant="secondary" onClick={() => setEditing('new')}>
            <Plus aria-hidden size={18} />
            {t('appt.add')}
          </Button>
        </div>
        {onSelected.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-4 text-center text-sm text-muted">{t('appt.nothingOnDay')}</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {onSelected.map((a) => (
              <li key={a.id}>
                <AppointmentRow appt={a} onOpen={() => setEditing(a)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-semibold tracking-wide text-muted uppercase">{t('appt.upcoming')}</h2>
        {data && data.openNotes > 0 && (
          <Link to="/notes" className="flex min-h-12 items-center gap-2 rounded-2xl bg-accent-soft px-4 font-medium">
            <NotebookPen aria-hidden size={18} className="text-accent" />
            {t('appt.doctorNotes', { count: data.openNotes })}
            <ChevronRight aria-hidden size={18} className="ml-auto text-muted" />
          </Link>
        )}
        {upcoming.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-4 text-center text-sm text-muted">{t('appt.noneUpcoming')}</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {upcoming.map((a) => (
              <li key={a.id}>
                <AppointmentRow appt={a} onOpen={() => setEditing(a)} showDate />
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <AppointmentEditor
          appointment={editing === 'new' ? null : editing}
          defaultStart={editing === 'new' ? defaultStartFor(selected) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
