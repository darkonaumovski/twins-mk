import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Square } from 'lucide-react';
import { Page } from '@/components/ui';
import { useLive } from '@/data/StoreContext';
import { dateLocale } from '@/i18n';
import { useFormatMinutes, useNow } from '@/lib/useNow';
import type { LogEntry, TwinSlot } from '@/data/types';
import { LOG_ICONS, useDescribeEntry } from '@/features/log/describe';
import { BABY_IDS, minutesBetween, SLOTS, slotOf } from '@/features/log/logic';
import { useLogUI } from '@/features/log/LogUIContext';
import { QuickLogPanel } from '@/features/log/QuickLogPanel';
import { useLogActions, useRunning } from '@/features/log/useLogActions';
import { colorOf, twinStyle, TwinBadge, useBabies, useTwinName, type Babies } from '@/features/twins/twins';
import { DaySummaryView, Timeline, useDayEntries } from '@/features/history/DayViews';
import { UpcomingSection } from '@/features/plan/UpcomingSection';

function useLatest() {
  return useLive(async (s) => {
    const result: Record<TwinSlot, { feed?: LogEntry; diaper?: LogEntry; sleep?: LogEntry }> = { A: {}, B: {} };
    for (const slot of SLOTS) {
      const id = BABY_IDS[slot];
      const [feed, diaper, sleep] = await Promise.all([s.logs.latest(id, 'feed'), s.logs.latest(id, 'diaper'), s.logs.latest(id, 'sleep')]);
      result[slot] = { feed, diaper, sleep };
    }
    return result;
  }, []);
}

function SinceCard({ slot, babies, latest, now }: { slot: TwinSlot; babies: Babies; latest: ReturnType<typeof useLatest>; now: Date }) {
  const { t } = useTranslation();
  const name = useTwinName(babies);
  const fmt = useFormatMinutes();
  const last = latest?.[slot] ?? {};

  const ago = (iso: string | undefined) => {
    if (!iso) return t('today.never');
    const m = minutesBetween(iso, now);
    return m < 1 ? t('today.justNow') : t('today.ago', { duration: fmt(m) });
  };
  const feedText =
    last.feed && last.feed.end === null && last.feed.type === 'feed' && last.feed.data.method === 'breast'
      ? t('today.feeding', { duration: fmt(minutesBetween(last.feed.start, now)) })
      : ago(last.feed?.start);
  const sleepText = !last.sleep
    ? t('today.never')
    : last.sleep.end === null
      ? t('today.sleeping', { duration: fmt(minutesBetween(last.sleep.start, now)) })
      : t('today.awake', { duration: fmt(minutesBetween(last.sleep.end, now)) });

  const rows = [
    { label: t('today.lastFeed'), icon: LOG_ICONS.feed, text: feedText },
    { label: t('today.lastDiaper'), icon: LOG_ICONS.diaper, text: ago(last.diaper?.start) },
    { label: t('today.lastSleep'), icon: LOG_ICONS.sleep, text: sleepText },
  ];

  return (
    <section
      style={twinStyle(colorOf(babies, slot))}
      className="rounded-2xl border-2 border-(--tw) bg-(--tw-soft) p-3"
      aria-label={name(slot)}
    >
      <h2 className="mb-2 flex items-center gap-2 font-semibold text-(--tw-ink)">
        <TwinBadge slot={slot} color={colorOf(babies, slot)} size="sm" />
        <span className="truncate">{name(slot)}</span>
      </h2>
      <dl className="space-y-1.5 text-sm">
        {rows.map(({ label, icon: Icon, text }) => (
          <div key={label} className="flex items-start gap-1.5">
            <Icon aria-hidden size={16} className="mt-0.5 shrink-0 text-muted" />
            <dt className="sr-only">{label}</dt>
            <dd className="font-medium">{text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function TodayPage() {
  const { t, i18n } = useTranslation();
  // Refresh often enough that running timers visibly tick.
  const now = useNow(10_000);
  const babies = useBabies();
  const latest = useLatest();
  const running = useRunning() ?? [];
  const describe = useDescribeEntry();
  const fmt = useFormatMinutes();
  const name = useTwinName(babies);
  const ui = useLogUI();
  const { stopTimers } = useLogActions();
  const dayKey = format(now, 'yyyy-MM-dd');
  const day = useDayEntries(dayKey);

  if (!babies) return null;
  if (!babies.ready) {
    return (
      <Page title={t('today.title')}>
        <Link to="/setup" className="block rounded-2xl bg-accent p-5 text-center font-semibold text-on-accent">
          {t('settings.setUpTwins')}
        </Link>
      </Page>
    );
  }

  return (
    <Page
      title={t('today.title')}
      actions={<span className="text-sm text-muted">{format(now, 'EEEE d MMM', { locale: dateLocale(i18n.language) })}</span>}
    >
      {running.length > 0 && (
        <section aria-label={t('today.running')} className="space-y-2">
          {running.map((e) => {
            const slot = slotOf(e.babyId);
            const what = describe(e, now);
            return (
              <div
                key={e.id}
                style={twinStyle(colorOf(babies, slot))}
                className="flex items-center gap-3 rounded-2xl border-2 border-(--tw) bg-surface p-3"
              >
                <TwinBadge slot={slot} color={colorOf(babies, slot)} />
                <button type="button" onClick={() => ui.edit(e)} className="flex-1 text-left">
                  <span className="block font-semibold">
                    {name(slot)} · {what.title}
                  </span>
                  <span className="block text-2xl font-bold tabular-nums">{fmt(minutesBetween(e.start, now))}</span>
                </button>
                <button
                  type="button"
                  onClick={() => stopTimers([e], what.title, slot)}
                  className="flex min-h-14 items-center gap-2 rounded-2xl bg-ink px-5 font-semibold text-bg"
                >
                  <Square aria-hidden size={18} fill="currentColor" />
                  {t('log.stop')}
                </button>
              </div>
            );
          })}
        </section>
      )}

      <div className="grid grid-cols-2 gap-3">
        {SLOTS.map((slot) => (
          <SinceCard key={slot} slot={slot} babies={babies} latest={latest} now={now} />
        ))}
      </div>

      <UpcomingSection now={now} />

      <QuickLogPanel />

      {day && (
        <>
          <section className="space-y-2">
            <h2 className="px-1 text-sm font-semibold tracking-wide text-muted uppercase">{t('summary.title')}</h2>
            <DaySummaryView date={dayKey} entries={day.all} babies={babies} now={now} />
          </section>
          <section className="space-y-2">
            <h2 className="px-1 text-sm font-semibold tracking-wide text-muted uppercase">{t('timeline.title')}</h2>
            <Timeline entries={day.starting} babies={babies} now={now} />
          </section>
        </>
      )}
    </Page>
  );
}
