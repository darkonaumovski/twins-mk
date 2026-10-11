import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import { Button } from '@/components/Button';
import { LineChart, type LineSeries } from '@/components/charts/LineChart';
import { Page } from '@/components/ui';
import { useLive } from '@/data/StoreContext';
import { dateLocale } from '@/i18n';
import { SLOTS } from '@/features/log/logic';
import { useLogUI } from '@/features/log/LogUIContext';
import { useWho } from '@/features/log/WhoPicker';
import { colorOf, twinStyle, TwinBadge, useBabies, useTwinName } from '@/features/twins/twins';
import { latestWeight, weightChange } from '@/features/twins/age';
import { useAgeText } from '@/features/twins/useAge';
import { formatNumber } from '@/lib/format';
import { growthPoints } from './summary';

export function GrowthPage() {
  const { t, i18n } = useTranslation();
  const babies = useBabies();
  const name = useTwinName(babies);
  const ui = useLogUI();
  const [who] = useWho();
  const ageText = useAgeText();
  const measures = useLive(async (s) => (await s.logs.list()).filter((e) => e.type === 'measure'), []);
  if (!babies || !measures) return null;

  const locale = dateLocale(i18n.language);
  const points = Object.fromEntries(SLOTS.map((slot) => [slot, growthPoints(babies[slot], measures)]));
  const build = (pick: 'weightG' | 'lengthCm'): LineSeries[] =>
    SLOTS.map((slot) => ({
      id: slot,
      slot,
      label: name(slot),
      color: colorOf(babies, slot),
      points: points[slot].flatMap((p) => (p[pick] === null ? [] : [{ t: new Date(p.at).getTime(), v: p[pick]! }])),
    })).filter((s) => s.points.length > 0);

  const weight = build('weightG');
  const length = build('lengthCm');
  const num = (digits: number) => (v: number) =>
    v.toLocaleString(i18n.language === 'mk' ? 'de-DE' : 'en-GB', { maximumFractionDigits: digits });
  const formatDate = (ms: number) => format(new Date(ms), 'd MMM', { locale });
  const total = weight.reduce((n, s) => n + s.points.length, 0);

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

      {weight.length === 0 && length.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">{t('growth.empty')}</p>
      )}
      {weight.length > 0 && (
        <>
          <LineChart
            title={t('growth.chart', { measure: t('growth.weight') })}
            series={weight}
            format={num(0)}
            formatDate={formatDate}
            tableHead={t('growth.date')}
          />
          {total < 2 && <p className="px-1 text-sm text-muted">{t('growth.onlyOne')}</p>}
        </>
      )}
      {length.length > 0 && (
        <LineChart
          title={t('growth.chart', { measure: t('growth.length') })}
          series={length}
          format={num(1)}
          formatDate={formatDate}
          tableHead={t('growth.date')}
        />
      )}
    </Page>
  );
}
