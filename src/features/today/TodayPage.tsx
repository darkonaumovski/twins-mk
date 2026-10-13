import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Hospital, House, Milk, Square } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { cx, Page } from '@/components/ui';
import { useLive, useStore } from '@/data/StoreContext';
import { dateLocale } from '@/i18n';
import { useFormatMinutes, useNow } from '@/lib/useNow';
import type { LogEntry, TwinSlot } from '@/data/types';
import { LOG_ICONS, useDescribeEntry } from '@/features/log/describe';
import { BABY_IDS, minutesBetween, nextFeedDue, SLOTS, slotOf, stopBothGroups, type BreastSide } from '@/features/log/logic';
import { useWho } from '@/features/log/WhoPicker';
import { useLogUI } from '@/features/log/LogUIContext';
import { QuickLogPanel } from '@/features/log/QuickLogPanel';
import { useLastSides, useLogActions, useRunning } from '@/features/log/useLogActions';
import { colorOf, twinStyle, TwinBadge, useBabies, useTwinName, type Babies } from '@/features/twins/twins';
import { DaySummaryView, Timeline, useDayEntries } from '@/features/history/DayViews';
import { UpcomingSection } from '@/features/plan/UpcomingSection';
import { DailyCareSection } from '@/features/plan/DailyCareSection';
import { MotherCard } from '@/features/mother/MotherCard';
import { SuppliesBanner } from '@/features/supplies/SuppliesBanner';
import { DutyLine, HandoverCard } from '@/features/family/Handover';
import { HospitalStrip } from '@/features/twins/HospitalStrip';
import { useAgeText } from '@/features/twins/useAge';
import { usePumpTimer } from '@/features/milk/usePumpTimer';

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

function SinceCard({
  slot,
  babies,
  latest,
  lastSide,
  now,
}: {
  slot: TwinSlot;
  babies: Babies;
  latest: ReturnType<typeof useLatest>;
  lastSide: BreastSide | null;
  now: Date;
}) {
  const { t, i18n } = useTranslation();
  const store = useStore();
  const toast = useToast();
  const name = useTwinName(babies);
  const fmt = useFormatMinutes();
  const ageText = useAgeText();
  const last = latest?.[slot] ?? {};
  const baby = babies[slot];
  const inHospital = baby?.location === 'hospital';
  const age = ageText(baby, now);

  const toggleLocation = async () => {
    if (!baby) return;
    const next = inHospital ? 'home' : 'hospital';
    await store.babies.update(baby.id, { location: next });
    toast({
      message: t(next === 'hospital' ? 'hospital.markedAway' : 'hospital.markedHome', { name: name(slot) }),
      action: { label: t('common.undo'), onClick: () => void store.babies.update(baby.id, { location: inHospital ? 'hospital' : 'home' }) },
    });
  };

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

  const feeding = last.feed?.end === null && last.feed.type === 'feed' && last.feed.data.method === 'breast';
  const due = feeding ? null : nextFeedDue(last.feed?.start, babies[slot]?.feedIntervalMin);
  const dueText = !due
    ? null
    : due > now
      ? t('today.nextFeed', { time: format(due, 'HH:mm', { locale: dateLocale(i18n.language) }) })
      : minutesBetween(due, now) < 1
        ? t('today.feedDueNow')
        : t('today.feedDue', { duration: fmt(minutesBetween(due, now)) });
  const sideText = lastSide
    ? t('today.lastSide', { side: { left: t('log.left'), right: t('log.right'), both: t('log.bothSides') }[lastSide] })
    : null;
  const feedExtra = [dueText, sideText].filter(Boolean).join(' · ');

  const rows = [
    { label: t('today.lastFeed'), icon: LOG_ICONS.feed, text: feedText, extra: feedExtra },
    { label: t('today.lastDiaper'), icon: LOG_ICONS.diaper, text: ago(last.diaper?.start) },
    { label: t('today.lastSleep'), icon: LOG_ICONS.sleep, text: sleepText },
  ];

  return (
    <section
      style={twinStyle(colorOf(babies, slot))}
      className="rounded-2xl border-2 border-(--tw) bg-(--tw-soft) p-3"
      aria-label={name(slot)}
    >
      <div className="mb-2 flex items-start gap-1">
        <h2 className="min-w-0 flex-1 font-semibold text-(--tw-ink)">
          <span className="flex items-center gap-2">
            <TwinBadge slot={slot} color={colorOf(babies, slot)} size="sm" />
            <span className="truncate">{name(slot)}</span>
          </span>
          {age && <span className="mt-0.5 block text-xs font-normal text-muted">{age}</span>}
        </h2>
        <button
          type="button"
          onClick={toggleLocation}
          aria-label={t(inHospital ? 'hospital.toggleToHome' : 'hospital.toggleToHospital', { name: name(slot) })}
          aria-pressed={inHospital}
          className={cx(
            '-mt-1 -mr-1 flex size-11 shrink-0 items-center justify-center rounded-full',
            inHospital ? 'bg-surface text-(--tw-ink)' : 'text-muted',
          )}
        >
          {inHospital ? <Hospital aria-hidden size={20} /> : <House aria-hidden size={20} />}
        </button>
      </div>
      {inHospital && <p className="mb-2 text-xs font-semibold text-(--tw-ink)">{t('hospital.inHospital')}</p>}
      <dl className={cx('space-y-1.5 text-sm', inHospital && 'opacity-60')}>
        {rows.map(({ label, icon: Icon, text, extra }) => (
          <div key={label} className="flex items-start gap-1.5">
            <Icon aria-hidden size={16} className="mt-0.5 shrink-0 text-muted" />
            <dt className="sr-only">{label}</dt>
            <dd className="font-medium">
              {text}
              {extra && <span className="block text-xs font-normal text-muted">{extra}</span>}
            </dd>
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
  const lastSides = useLastSides();
  const describe = useDescribeEntry();
  const fmt = useFormatMinutes();
  const name = useTwinName(babies);
  const ui = useLogUI();
  const { stopTimers } = useLogActions();
  const pumpTimer = usePumpTimer();
  const pumping = pumpTimer.running;
  const [who] = useWho();
  const [params, setParams] = useSearchParams();
  const shortcut = params.get('log');

  // Home-screen shortcuts open Today with ?log=feed|diaper|sleep: open the matching sheet once.
  useEffect(() => {
    if (!shortcut || !babies?.ready) return;
    if (shortcut === 'feed') ui.feed(who);
    else if (shortcut === 'diaper' || shortcut === 'sleep') ui.quick();
    setParams({}, { replace: true });
  }, [shortcut, babies?.ready, ui, who, setParams]);
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
      {(running.length > 0 || pumping) && (
        <section aria-label={t('today.running')} className="space-y-2">
          {stopBothGroups(running).map((group) => {
            const what = group.kind === 'sleep' ? t('log.sleep') : t('log.breast');
            return (
              <button
                key={group.kind}
                type="button"
                onClick={() => stopTimers(group.entries, what, 'both')}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 font-semibold text-bg"
              >
                <Square aria-hidden size={18} fill="currentColor" />
                {t('today.stopBoth', { what })}
              </button>
            );
          })}
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
          {pumping && (
            <div className="flex items-center gap-3 rounded-2xl border-2 border-accent bg-surface p-3">
              <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Milk size={18} />
              </span>
              <button type="button" onClick={() => ui.pumpTimer(pumping.id)} className="flex-1 text-left">
                <span className="block font-semibold">
                  {t('milk.pump')} · {pumping.side ? t(`milk.side.${pumping.side}`) : t('milk.mother')}
                </span>
                <span className="block text-2xl font-bold tabular-nums">{fmt(minutesBetween(pumping.start, now))}</span>
              </button>
              <button
                type="button"
                onClick={() => void pumpTimer.stop(pumping)}
                className="flex min-h-14 items-center gap-2 rounded-2xl bg-ink px-5 font-semibold text-bg"
              >
                <Square aria-hidden size={18} fill="currentColor" />
                {t('log.stop')}
              </button>
            </div>
          )}
        </section>
      )}

      <DutyLine now={now} />

      <HandoverCard babies={babies} now={now} />

      <HospitalStrip babies={babies} now={now} />

      <SuppliesBanner now={now} />

      <div className="grid grid-cols-2 gap-3">
        {SLOTS.map((slot) => (
          <SinceCard key={slot} slot={slot} babies={babies} latest={latest} lastSide={lastSides?.[slot] ?? null} now={now} />
        ))}
      </div>

      <DailyCareSection now={now} />

      <MotherCard now={now} />

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
            <Timeline entries={day.starting} pumps={day.pumps} babies={babies} now={now} />
          </section>
        </>
      )}
    </Page>
  );
}
