import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, format, parseISO } from 'date-fns';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useLive, useSettings } from '@/data/StoreContext';
import type { ISODate } from '@/data/types';
import { dateLocale } from '@/i18n';
import { formatNumber } from '@/lib/format';
import { useFormatMinutes } from '@/lib/useNow';
import { BABY_IDS, SLOTS } from '@/features/log/logic';
import { colorOf, TwinBadge, twinStyle, useTwinName, type Babies } from '@/features/twins/twins';
import { change, insightsWithChange, type WeekInsights } from './insights';
import { localDay } from './summary';

type Key = 'longest' | 'sleep' | 'gap' | 'feeds' | 'ml' | 'breast';

interface Row {
  key: Key;
  label: string;
  value: string;
  detail?: string;
  /** Change from the week before in the same unit, already formatted; null when there is nothing to compare. */
  delta: { up: boolean; text: string } | null;
}

/**
 * "This week" per twin, side by side: plain numbers for the 7 days ending on the selected day, with
 * the change from the week before in a neutral colour. Tap a value to see how it is worked out.
 */
export function InsightsCard({ lastDay, babies, now }: { lastDay: ISODate; babies: Babies; now: Date }) {
  const { t, i18n } = useTranslation();
  const settings = useSettings();
  const name = useTwinName(babies);
  const fmt = useFormatMinutes();
  const [open, setOpen] = useState<string | null>(null);
  const entries = useLive(
    (s) => s.logs.listBetween(addDays(parseISO(lastDay), -15).toISOString(), addDays(localDay(lastDay).to, 1).toISOString()),
    [lastDay],
  );
  if (!entries || !settings) return null;

  const night = settings.nightHours;
  const locale = dateLocale(i18n.language);
  const num = (v: number) => formatNumber(v, i18n.language);
  const delta = (cur: number | null | undefined, prev: number | null | undefined, show: (v: number) => string) => {
    const d = change(cur, prev);
    return d === null || d === 0 ? null : { up: d > 0, text: show(Math.abs(d)) };
  };

  const rowsFor = (w: WeekInsights, p: WeekInsights): Row[] => {
    if (w.days === 0) return [];
    const ls = w.longestSleep;
    return [
      {
        key: 'longest',
        label: t('insights.longest'),
        value: ls ? fmt(ls.minutes) : '–',
        detail: ls
          ? t(ls.night ? 'insights.longestNight' : 'insights.longestDay', { date: format(parseISO(ls.day), 'EEE d MMM', { locale }) })
          : undefined,
        delta: delta(ls?.minutes, p.longestSleep?.minutes, fmt),
      },
      {
        key: 'sleep',
        label: t('insights.sleep'),
        value: w.sleepPerDay ? fmt(w.sleepPerDay.total) : '–',
        detail: w.sleepPerDay ? t('insights.sleepSplit', { day: fmt(w.sleepPerDay.day), night: fmt(w.sleepPerDay.night) }) : undefined,
        delta: delta(w.sleepPerDay?.total, p.sleepPerDay?.total, fmt),
      },
      {
        key: 'gap',
        label: t('insights.gap'),
        value: w.feedGapMin === null ? '–' : fmt(w.feedGapMin),
        delta: delta(w.feedGapMin, p.feedGapMin, fmt),
      },
      {
        key: 'feeds',
        label: t('insights.feeds'),
        value: w.feedsPerDay === null ? '–' : num(w.feedsPerDay),
        delta: delta(w.feedsPerDay, p.feedsPerDay, num),
      },
      ...(w.mlPerDay
        ? [
            {
              key: 'ml' as const,
              label: t('insights.ml'),
              value: `${w.mlPerDay} ml`,
              delta: delta(w.mlPerDay, p.mlPerDay, (v) => `${v} ml`),
            },
          ]
        : []),
      ...(w.breastMinPerDay
        ? [
            {
              key: 'breast' as const,
              label: t('insights.breast'),
              value: fmt(w.breastMinPerDay),
              delta: delta(w.breastMinPerDay, p.breastMinPerDay, fmt),
            },
          ]
        : []),
    ];
  };

  return (
    <section className="space-y-2" aria-labelledby="insights-title">
      <h2 id="insights-title" className="px-1 text-sm font-semibold tracking-wide text-muted uppercase">
        {t('insights.title', { date: format(parseISO(lastDay), 'd MMM', { locale }) })}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {SLOTS.map((slot) => {
          const { current, previous } = insightsWithChange(entries, BABY_IDS[slot], lastDay, night, now);
          const rows = rowsFor(current, previous);
          return (
            <div key={slot} style={twinStyle(colorOf(babies, slot))} className="rounded-2xl border border-line bg-surface p-3">
              <h3 className="mb-2 flex items-center gap-2 font-semibold">
                <TwinBadge slot={slot} color={colorOf(babies, slot)} size="sm" />
                <span className="truncate">{name(slot)}</span>
              </h3>
              {rows.length === 0 ? (
                <p className="text-sm text-muted">{t('insights.noData')}</p>
              ) : (
                <dl className="space-y-1 text-sm">
                  {rows.map((r) => {
                    const id = `${slot}-${r.key}`;
                    const expanded = open === id;
                    return (
                      <div key={r.key}>
                        <dt className="text-muted">{r.label}</dt>
                        <dd>
                          <button
                            type="button"
                            aria-expanded={expanded}
                            onClick={() => setOpen(expanded ? null : id)}
                            className="-mx-1 flex min-h-11 w-[calc(100%+0.5rem)] flex-col justify-center rounded-lg px-1 text-left hover:bg-surface-2"
                          >
                            <span className="flex flex-wrap items-baseline gap-x-1.5">
                              <span className="font-semibold">{r.value}</span>
                              {r.delta && (
                                <span className="inline-flex items-center text-xs text-muted">
                                  {r.delta.up ? <ArrowUp aria-hidden size={12} /> : <ArrowDown aria-hidden size={12} />}
                                  <span className="sr-only">{r.delta.up ? t('insights.more') : t('insights.less')}</span>
                                  {r.delta.text}
                                </span>
                              )}
                            </span>
                            {r.detail && <span className="block text-xs text-muted">{r.detail}</span>}
                          </button>
                          {expanded && (
                            <p className="mt-1 rounded-lg bg-surface-2 p-2 text-xs">
                              {t(`insights.how.${r.key}`, { from: night.from, to: night.to })}
                            </p>
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              )}
              {current.days > 0 && <p className="mt-2 text-xs text-muted">{t('insights.basedOn', { count: current.days })}</p>}
            </div>
          );
        })}
      </div>
      <p className="px-1 text-xs text-muted">{t('insights.vsPrevious')}</p>
    </section>
  );
}
