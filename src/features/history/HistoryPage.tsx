import { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { addDays, format, isValid, parseISO } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from '@/components/Button';
import { BarChart, type BarSeries } from '@/components/charts/BarChart';
import { Page } from '@/components/ui';
import { useLive } from '@/data/StoreContext';
import { dateLocale } from '@/i18n';
import { todayISO } from '@/lib/format';
import { useNow } from '@/lib/useNow';
import type { ISODate } from '@/data/types';
import { BABY_IDS, SLOTS } from '@/features/log/logic';
import { colorOf, useBabies, useTwinName } from '@/features/twins/twins';
import { finishedPumps, pumpedPerDay } from '@/features/milk/logic';
import { DaySummaryView, Timeline, useDayEntries } from './DayViews';
import { daysEnding, localDay, summarize, type DaySummary } from './summary';
import { RhythmCard } from './RhythmCard';

const WEEK = 7;

function WeekCharts({ lastDay }: { lastDay: ISODate }) {
  const { t, i18n } = useTranslation();
  const now = useNow(60_000);
  const babies = useBabies();
  const name = useTwinName(babies);
  const days = daysEnding(lastDay, WEEK);
  const entries = useLive(
    (s) => s.logs.listBetween(addDays(parseISO(days[0]), -1).toISOString(), localDay(lastDay).to.toISOString()),
    [lastDay],
  );
  const pumps = useLive((s) => s.pumps.list(), []);
  if (!entries || !babies) return null;

  const locale = dateLocale(i18n.language);
  const categories = days.map((d) => ({
    short: format(parseISO(d), 'EEEEEE', { locale }),
    long: format(parseISO(d), 'EEEE d MMM', { locale }),
  }));
  const perTwin = SLOTS.map((slot) => ({
    slot,
    days: days.map((d) => {
      const { from, to } = localDay(d);
      return summarize(entries, BABY_IDS[slot], from, to, now);
    }),
  }));
  const series = (pick: (s: DaySummary) => number): BarSeries[] =>
    perTwin.map(({ slot, days: sums }) => ({
      id: slot,
      slot,
      label: name(slot),
      color: colorOf(babies, slot),
      values: sums.map(pick),
    }));
  const count = (v: number) => String(Math.round(v));
  const hours = (v: number) => (Math.round(v * 10) / 10).toLocaleString(i18n.language === 'mk' ? 'de-DE' : 'en-GB');

  return (
    <section className="space-y-3">
      <h2 className="px-1 text-sm font-semibold tracking-wide text-muted uppercase">
        {t('history.week', { date: format(parseISO(lastDay), 'd MMM', { locale }) })}
      </h2>
      <BarChart title={t('history.feeds')} categories={categories} series={series((s) => s.feeds)} format={count} />
      <BarChart title={t('history.ml')} categories={categories} series={series((s) => s.ml)} format={count} />
      <BarChart title={t('history.diapers')} categories={categories} series={series((s) => s.diapers)} format={count} />
      <BarChart title={t('history.sleep')} categories={categories} series={series((s) => s.sleepMinutes / 60)} format={hours} />
      {pumps && finishedPumps(pumps).length > 0 && (
        <BarChart
          title={t('history.pumped')}
          categories={categories}
          series={[{ id: 'mother', label: t('milk.mother'), color: 'accent', values: pumpedPerDay(pumps, days.map(localDay)) }]}
          format={count}
        />
      )}
    </section>
  );
}

export function HistoryPage() {
  const { t, i18n } = useTranslation();
  const now = useNow(60_000);
  const babies = useBabies();
  const [params, setParams] = useSearchParams();
  const today = todayISO(now);
  const requested = params.get('d');
  const date: ISODate = requested && isValid(parseISO(requested)) && requested <= today ? requested : today;
  const day = useDayEntries(date);
  const dateInput = useRef<HTMLInputElement>(null);

  const go = (d: ISODate) => setParams(d === today ? {} : { d }, { replace: true });
  const shift = (n: number) => go(format(addDays(parseISO(date), n), 'yyyy-MM-dd'));
  const locale = dateLocale(i18n.language);

  return (
    <Page title={t('history.title')}>
      <div className="flex items-center gap-1 rounded-2xl border border-line bg-surface p-1">
        <IconButton label={t('history.prevDay')} onClick={() => shift(-1)}>
          <ChevronLeft aria-hidden size={24} />
        </IconButton>
        <label className="relative flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl font-semibold">
          <CalendarDays aria-hidden size={18} className="text-muted" />
          <span aria-live="polite">{date === today ? t('history.today') : format(parseISO(date), 'EEEE d MMM yyyy', { locale })}</span>
          <input
            ref={dateInput}
            type="date"
            value={date}
            max={today}
            aria-label={t('history.pickDay')}
            onChange={(e) => e.target.value && go(e.target.value)}
            onClick={() => dateInput.current?.showPicker?.()}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <IconButton label={t('history.nextDay')} onClick={() => shift(1)} disabled={date >= today} className="disabled:opacity-30">
          <ChevronRight aria-hidden size={24} />
        </IconButton>
      </div>

      {babies && day && (
        <>
          <DaySummaryView date={date} entries={day.all} babies={babies} now={now} />
          <Timeline entries={day.starting} pumps={day.pumps} babies={babies} now={now} />
          <RhythmCard
            lastDay={date}
            babies={babies}
            now={now}
            onOpenDay={(d) => {
              go(d);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
          <WeekCharts lastDay={date} />
        </>
      )}
    </Page>
  );
}
