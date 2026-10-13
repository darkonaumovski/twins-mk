import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import { Button } from '@/components/Button';
import { LineChart, type LineSeries } from '@/components/charts/LineChart';
import { Page, Segmented, Toggle } from '@/components/ui';
import { useDevicePrefs, useLive, useStore } from '@/data/StoreContext';
import { dateLocale } from '@/i18n';
import type { TwinSlot } from '@/data/types';
import { SLOTS } from '@/features/log/logic';
import { useLogUI } from '@/features/log/LogUIContext';
import { useWho } from '@/features/log/WhoPicker';
import { colorOf, twinStyle, TwinBadge, useBabies, useTwinName } from '@/features/twins/twins';
import { latestWeight, weightChange } from '@/features/twins/age';
import { useAgeText, useFormatAgeDays } from '@/features/twins/useAge';
import { formatNumber } from '@/lib/format';
import { loadWhoTables } from '@/features/growth/who/load';
import {
  ageDomain,
  ageAxisDays,
  agePoints,
  DAYS_PER_MONTH,
  referenceLines,
  tablesIfWanted,
  usesCorrectedAge,
  type WhoMeasure,
  type WhoTables,
} from '@/features/growth/who/lms';
import { growthPoints, type GrowthPoint } from './summary';

type Pick3 = 'weightG' | 'lengthCm' | 'headCm';
const MEASURES: { pick: Pick3; who: WhoMeasure; label: 'growth.weight' | 'growth.length' | 'growth.head'; digits: number }[] = [
  { pick: 'weightG', who: 'weight', label: 'growth.weight', digits: 0 },
  { pick: 'lengthCm', who: 'length', label: 'growth.length', digits: 1 },
  { pick: 'headCm', who: 'head', label: 'growth.head', digits: 1 },
];
/** The WHO tables cover 0–24 months. */
const WHO_LAST_DAY = 24 * DAYS_PER_MONTH;

export function GrowthPage() {
  const { t, i18n } = useTranslation();
  const store = useStore();
  const babies = useBabies();
  const name = useTwinName(babies);
  const ui = useLogUI();
  const [who] = useWho();
  const ageText = useAgeText();
  const fmtAge = useFormatAgeDays();
  const prefs = useDevicePrefs();
  const measures = useLive(async (s) => (await s.logs.list()).filter((e) => e.type === 'measure'), []);
  const curvesOn = prefs?.whoCurves === true;
  const [curveSlot, setCurveSlot] = useState<TwinSlot>(who === 'B' ? 'B' : 'A');
  const curveBaby = babies?.[curveSlot];
  const sex = curveBaby?.sex;
  const [tables, setTables] = useState<WhoTables | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  // The tables are a separate chunk, loaded only while the curves are on and the twin's sex is set.
  useEffect(() => {
    let live = true;
    tablesIfWanted(curvesOn, sex, loadWhoTables)
      .then((loaded) => live && setTables(loaded))
      // If the chunk cannot be loaded, the usual date charts stay.
      .catch(() => live && setLoadFailed(true));
    return () => {
      live = false;
    };
  }, [curvesOn, sex]);

  if (!babies || !measures || !prefs) return null;

  const locale = dateLocale(i18n.language);
  const points: Record<TwinSlot, GrowthPoint[]> = { A: growthPoints(babies.A, measures), B: growthPoints(babies.B, measures) };
  const build = (pick: Pick3): LineSeries[] =>
    SLOTS.map((slot) => ({
      id: slot,
      slot,
      label: name(slot),
      color: colorOf(babies, slot),
      points: points[slot].flatMap((p) => (p[pick] === null ? [] : [{ t: new Date(p.at).getTime(), v: p[pick]! }])),
    })).filter((s) => s.points.length > 0);

  const num = (digits: number) => (v: number) =>
    v.toLocaleString(i18n.language === 'mk' ? 'de-DE' : 'en-GB', { maximumFractionDigits: digits });
  const formatDate = (ms: number) => format(new Date(ms), 'd MMM', { locale });
  const charts = MEASURES.map((m) => ({ ...m, series: build(m.pick) }));
  const total = charts[0].series.reduce((n, s) => n + s.points.length, 0);
  const empty = charts.every((c) => c.series.length === 0);

  // With the reference curves: one twin at a time, against age (corrected age for a twin born early).
  const curvesReady = curvesOn && curveBaby?.birthDateTime && sex && tables;
  // Before the due date (corrected age below 0) with a minus sign; never "−0".
  const signed = (value: number, text: (abs: number) => string) => (value < 0 ? `−${text(-value)}` : text(value));
  const ageLabel = (days: number) => signed(Math.round(days), fmtAge);
  const ageTick = (span: number) => (days: number) =>
    span > 3 * DAYS_PER_MONTH
      ? signed(Math.round(days / DAYS_PER_MONTH), (count) => t('growth.months', { count }))
      : signed(Math.round(days / 7), (count) => t('age.weeks', { count }));

  // While the tables load (a moment, from the phone), a short note instead of the date charts.
  const loading = Boolean(curvesOn && curveBaby?.birthDateTime && sex && !tables && !loadFailed);

  const curveChart = (m: (typeof MEASURES)[number]) => {
    if (!curvesReady) return null;
    const pts = agePoints(
      curveBaby,
      points[curveSlot].map((p) => ({ at: p.at, value: p[m.pick] })),
    );
    if (pts.length === 0) return null;
    const domain = ageDomain(pts.map((p) => p.t));
    const reference = referenceLines(tables, m.who, sex, domain[0], Math.min(domain[1], WHO_LAST_DAY)).map((r) => ({
      id: `p${r.p}`,
      points: r.points,
    }));
    const series: LineSeries[] = [
      { id: curveSlot, slot: curveSlot, label: name(curveSlot), color: colorOf(babies, curveSlot), points: pts },
    ];
    return (
      <div key={m.pick} className="space-y-1">
        <LineChart
          title={t('growth.chartByAge', { measure: t(m.label), name: name(curveSlot) })}
          series={series}
          reference={reference}
          domain={domain}
          day={1}
          format={num(m.digits)}
          formatDate={ageLabel}
          formatTick={ageTick(domain[1] - domain[0])}
          tableHead={t('growth.ageAxis')}
        />
        <p className="px-1 text-xs text-muted">{t('growth.caption')}</p>
      </div>
    );
  };

  const curveCharts = MEASURES.map(curveChart);

  return (
    <Page
      title={t('growth.title')}
      actions={
        <Button variant="secondary" onClick={() => ui.create('measure', who)}>
          <Plus aria-hidden size={18} />
          {t('growth.add')}
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        {SLOTS.map((slot) => {
          const baby = babies[slot];
          const change = weightChange(baby?.birthWeightG ?? null, latestWeight(points[slot]));
          const age = ageText(baby, new Date());
          return (
            <section key={slot} style={twinStyle(colorOf(babies, slot))} className="rounded-2xl border border-line bg-surface p-3 text-sm">
              <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
                <TwinBadge slot={slot} color={colorOf(babies, slot)} size="sm" />
                <span className="truncate">{name(slot)}</span>
              </h2>
              {age && <p className="text-muted">{age}</p>}
              {change && (
                <p className="font-medium">
                  {t('growth.change', {
                    g: `${change.grams > 0 ? '+' : ''}${formatNumber(change.grams, i18n.language, 0)}`,
                    pct: `${change.percent > 0 ? '+' : ''}${formatNumber(change.percent, i18n.language)}`,
                  })}
                </p>
              )}
            </section>
          );
        })}
      </div>

      <div className="space-y-1 rounded-2xl border border-line bg-surface px-4 py-2">
        <Toggle label={t('growth.curves')} checked={curvesOn} onChange={(v) => void store.device.update({ whoCurves: v })} />
        <p className="pb-1 text-sm text-muted">{t('growth.curvesHint')}</p>
      </div>

      {empty && <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">{t('growth.empty')}</p>}

      {curvesOn && !empty && (
        <div className="space-y-3">
          <Segmented<TwinSlot>
            label={t('growth.curvesFor')}
            value={curveSlot}
            options={SLOTS.map((slot) => ({ value: slot, label: name(slot) }))}
            onChange={setCurveSlot}
          />
          {!curveBaby?.birthDateTime ? (
            <p className="text-sm text-muted">{t('growth.noBirth', { name: name(curveSlot) })}</p>
          ) : !sex ? (
            <p className="space-x-1 text-sm">
              <span className="text-muted">{t('growth.noSex', { name: name(curveSlot) })}</span>
              <Link to="/setup" className="font-semibold text-accent underline">
                {t('growth.openSetup')}
              </Link>
            </p>
          ) : (
            curvesReady && (
              <div className="space-y-1 px-1 text-xs text-muted">
                <p>{t('growth.curvesLegend')}</p>
                {usesCorrectedAge(curveBaby) && <p>{t('growth.correctedAxis', { name: name(curveSlot) })}</p>}
                {points[curveSlot].some((p) => (ageAxisDays(curveBaby, p.at) ?? 0) > WHO_LAST_DAY) && <p>{t('growth.beyond')}</p>}
              </div>
            )
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted" role="status">
          {t('growth.loading')}
        </p>
      ) : curvesReady ? (
        curveCharts.some(Boolean) ? (
          curveCharts
        ) : (
          <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">
            {t('growth.noneFor', { name: name(curveSlot) })}
          </p>
        )
      ) : null}
      {curvesReady || loading
        ? null
        : charts.map(
            (c, i) =>
              c.series.length > 0 && (
                <div key={c.pick} className="space-y-1">
                  <LineChart
                    title={t('growth.chart', { measure: t(c.label) })}
                    series={c.series}
                    format={num(c.digits)}
                    formatDate={formatDate}
                    tableHead={t('growth.date')}
                  />
                  {i === 0 && total < 2 && <p className="px-1 text-sm text-muted">{t('growth.onlyOne')}</p>}
                </div>
              ),
          )}
    </Page>
  );
}
