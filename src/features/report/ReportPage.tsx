import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, format, parseISO } from 'date-fns';
import { Printer, Share2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { Page, Segmented } from '@/components/ui';
import { useLive } from '@/data/StoreContext';
import { dateLocale } from '@/i18n';
import { formatNumber, todayISO } from '@/lib/format';
import type { Baby, TwinSlot } from '@/data/types';
import { daysEnding, growthPoints, localDay, type DaySummary } from '@/features/history/summary';
import { BABY_IDS, type Who } from '@/features/log/logic';
import { colorOf, TwinBadge, useBabies, useTwinName } from '@/features/twins/twins';
import { useAgeText } from '@/features/twins/useAge';
import { openNotesFor, reportRows, reportTotals } from './logic';

const PERIODS = [7, 14, 30] as const;
type Period = `${(typeof PERIODS)[number]}`;

const cell = 'border border-line px-1.5 py-1 text-right tabular-nums';
const head = 'border border-line bg-surface-2 px-1.5 py-1 text-left font-semibold';

/**
 * A clean, printable summary for a check-up: daily numbers per twin, growth and
 * open questions. Print it, save it as PDF from the print dialog, or share it as text.
 */
export function ReportPage() {
  const { t, i18n } = useTranslation();
  const babies = useBabies();
  const name = useTwinName(babies);
  const ageText = useAgeText();
  const [who, setWho] = useState<Who>('both');
  const [period, setPeriod] = useState<Period>('7');
  const lastDay = todayISO();
  const days = daysEnding(lastDay, Number(period));
  const data = useLive(
    async (s) => {
      const from = addDays(parseISO(days[0]), -1).toISOString();
      const [entries, measures, notes] = await Promise.all([
        s.logs.listBetween(from, localDay(lastDay).to.toISOString()),
        s.logs.list(),
        s.doctorNotes.list(),
      ]);
      return { entries, measures: measures.filter((e) => e.type === 'measure'), notes };
    },
    [period, lastDay],
  );
  if (!babies || !data) return null;

  const locale = dateLocale(i18n.language);
  const now = new Date();
  const slots: TwinSlot[] = who === 'both' ? ['A', 'B'] : [who];
  const dayLabel = (d: string) => format(parseISO(d), 'EEE d MMM', { locale });
  const hours = (min: number) => formatNumber(min / 60, i18n.language);
  const perTwin = slots.map((slot) => {
    const rows = reportRows(data.entries, BABY_IDS[slot], days, now);
    return { slot, rows, total: reportTotals(rows) };
  });
  const notes = openNotesFor(data.notes, slots);
  const range = `${format(parseISO(days[0]), 'd MMM', { locale })} – ${format(parseISO(lastDay), 'd MMM yyyy', { locale })}`;

  const line = (s: DaySummary) =>
    t('report.textLine', {
      feeds: s.feeds,
      ml: s.ml,
      breast: s.breastMinutes,
      wet: s.wet,
      dirty: s.dirty,
      sleep: hours(s.sleepMinutes),
      meds: s.meds,
    });
  const shareText = [
    `${t('report.title')} · ${range}`,
    ...perTwin.flatMap(({ slot, rows }) => ['', name(slot), ...rows.map((r) => `${dayLabel(r.date)}: ${line(r.summary)}`)]),
    ...(notes.length ? ['', t('report.notes'), ...notes.map((n) => `• ${n.text}`)] : []),
    '',
    t('report.disclaimer'),
  ].join('\n');
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const twinFacts = (baby: Baby | undefined) => {
    if (!baby) return [];
    const facts: string[] = [];
    if (baby.birthDateTime) facts.push(t('report.born', { date: format(new Date(baby.birthDateTime), 'd MMM yyyy', { locale }) }));
    if (baby.gestationWeeksAtBirth)
      facts.push(t('report.gestation', { weeks: baby.gestationWeeksAtBirth, days: baby.gestationDaysAtBirth ?? 0 }));
    if (baby.birthWeightG) facts.push(t('report.birthWeight', { g: baby.birthWeightG }));
    const age = ageText(baby, now);
    if (age) facts.push(age);
    return facts;
  };

  return (
    <Page title={t('report.title')}>
      <div className="space-y-4 print:hidden">
        <Segmented<Who>
          label={t('report.for')}
          value={who}
          options={[
            { value: 'A', label: name('A') },
            { value: 'both', label: t('twins.both') },
            { value: 'B', label: name('B') },
          ]}
          onChange={setWho}
        />
        <Segmented<Period>
          label={t('report.period')}
          value={period}
          options={PERIODS.map((n) => ({ value: `${n}` as Period, label: t('report.days', { count: n }) }))}
          onChange={setPeriod}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => window.print()}>
            <Printer aria-hidden size={20} />
            {t('report.print')}
          </Button>
          {canShare && (
            <Button variant="secondary" onClick={() => void navigator.share({ title: t('report.title'), text: shareText }).catch(() => {})}>
              <Share2 aria-hidden size={20} />
              {t('report.share')}
            </Button>
          )}
        </div>
        <p className="text-sm text-muted">{t('report.printHint')}</p>
      </div>

      <article className="space-y-6 text-sm print:text-[10pt]">
        <header className="border-b border-line pb-2">
          <h2 className="text-lg font-bold">
            {t('report.title')} · {range}
          </h2>
          <p className="text-muted">{t('report.made', { date: format(now, 'd MMM yyyy HH:mm', { locale }) })}</p>
        </header>

        {perTwin.map(({ slot, rows, total }) => (
          <section key={slot} className="space-y-2 break-inside-avoid-page">
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <TwinBadge slot={slot} color={colorOf(babies, slot)} size="sm" />
              {name(slot)}
            </h3>
            <p className="text-muted">{twinFacts(babies[slot]).join(' · ')}</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className={head}>{t('report.col.date')}</th>
                    <th className={head}>{t('report.col.feeds')}</th>
                    <th className={head}>{t('report.col.ml')}</th>
                    <th className={head}>{t('report.col.breast')}</th>
                    <th className={head}>{t('report.col.wet')}</th>
                    <th className={head}>{t('report.col.dirty')}</th>
                    <th className={head}>{t('report.col.sleep')}</th>
                    <th className={head}>{t('report.col.meds')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ date, summary: s }) => (
                    <tr key={date}>
                      <td className={`${cell} text-left`}>{dayLabel(date)}</td>
                      <td className={cell}>{s.feeds}</td>
                      <td className={cell}>{s.ml}</td>
                      <td className={cell}>{s.breastMinutes}</td>
                      <td className={cell}>{s.wet}</td>
                      <td className={cell}>{s.dirty}</td>
                      <td className={cell}>{hours(s.sleepMinutes)}</td>
                      <td className={cell}>{s.meds}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td className={`${cell} text-left`}>{t('report.average')}</td>
                    <td className={cell}>{formatNumber(total.feeds / rows.length, i18n.language)}</td>
                    <td className={cell}>{formatNumber(total.ml / rows.length, i18n.language, 0)}</td>
                    <td className={cell}>{formatNumber(total.breastMinutes / rows.length, i18n.language, 0)}</td>
                    <td className={cell}>{formatNumber(total.wet / rows.length, i18n.language)}</td>
                    <td className={cell}>{formatNumber(total.dirty / rows.length, i18n.language)}</td>
                    <td className={cell}>{hours(total.sleepMinutes / rows.length)}</td>
                    <td className={cell}>{formatNumber(total.meds / rows.length, i18n.language)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-muted">{t('report.units')}</p>
          </section>
        ))}

        <section className="space-y-2 break-inside-avoid-page">
          <h3 className="text-base font-semibold">{t('report.growth')}</h3>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className={head}>{t('report.col.twin')}</th>
                <th className={head}>{t('report.col.date')}</th>
                <th className={head}>{t('growth.weight')}</th>
                <th className={head}>{t('growth.length')}</th>
              </tr>
            </thead>
            <tbody>
              {slots.flatMap((slot) =>
                growthPoints(babies[slot], data.measures).map((p) => (
                  <tr key={`${slot}-${p.at}`}>
                    <td className={`${cell} text-left`}>{name(slot)}</td>
                    <td className={`${cell} text-left`}>
                      {format(new Date(p.at), 'd MMM yyyy', { locale })}
                      {p.birth && ` (${t('report.atBirth')})`}
                    </td>
                    <td className={cell}>{p.weightG ?? '–'}</td>
                    <td className={cell}>{p.lengthCm === null ? '–' : formatNumber(p.lengthCm, i18n.language)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </section>

        <section className="space-y-2 break-inside-avoid-page">
          <h3 className="text-base font-semibold">{t('report.notes')}</h3>
          {notes.length === 0 ? (
            <p className="text-muted">{t('report.noNotes')}</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5">
              {notes.map((n) => (
                <li key={n.id}>{n.text}</li>
              ))}
            </ul>
          )}
        </section>

        <p className="border-t border-line pt-2 text-xs text-muted">{t('report.disclaimer')}</p>
      </article>
    </Page>
  );
}
