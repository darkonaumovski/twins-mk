import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, format, parseISO } from 'date-fns';
import { Printer, Share2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { Page, Segmented, Toggle } from '@/components/ui';
import { useLive } from '@/data/StoreContext';
import { dateLocale } from '@/i18n';
import { formatNumber, todayISO } from '@/lib/format';
import type { Baby, TwinSlot, DoctorNote, StoolColor, StoolTexture, Vaccine } from '@/data/types';
import { daysEnding, growthPoints, localDay, type DaySummary } from '@/features/history/summary';
import { BABY_IDS, type Who } from '@/features/log/logic';
import { colorOf, TwinBadge, useBabies, useTwinName } from '@/features/twins/twins';
import { useAgeText } from '@/features/twins/useAge';
import { vaccinesInPeriod } from '@/features/vaccines/logic';
import { motherMedsBetween } from '@/features/mother/logic';
import { triesInPeriod } from '@/features/foods/logic';
import { useLabel } from '@/lib/labels';
import { openNotesFor, reportDiapers, reportRows, reportTotals, type ReportDiapers } from './logic';

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
  const label = useLabel();
  const [who, setWho] = useState<Who>('both');
  const [period, setPeriod] = useState<Period>('7');
  const [includeMother, setIncludeMother] = useState(false);
  // The mother's medicines are left out unless the parents add them (never her check-ins or mood).
  const [includeMotherMeds, setIncludeMotherMeds] = useState(false);
  const lastDay = todayISO();
  const days = daysEnding(lastDay, Number(period));
  const data = useLive(
    async (s) => {
      const from = addDays(parseISO(days[0]), -1).toISOString();
      const [entries, measures, notes, vaccines, motherLogs, foods, foodTries] = await Promise.all([
        s.logs.listBetween(from, localDay(lastDay).to.toISOString()),
        s.logs.list(),
        s.doctorNotes.list(),
        s.vaccines.list(),
        s.motherLogs.list(),
        s.foods.listAll(),
        s.foodTries.list(),
      ]);
      return { entries, measures: measures.filter((e) => e.type === 'measure'), notes, vaccines, motherLogs, foods, foodTries };
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
    const diapers = reportDiapers(data.entries, BABY_IDS[slot], days);
    return { slot, rows, total: reportTotals(rows), diapers, showRash: diapers.period.rash > 0 };
  });
  // "Colour: yellow 5, green 2 · Texture: soft 6": the period's dirty-diaper details, if any were noted.
  const counts = (pairs: [string, number][], label: (key: string) => string) =>
    pairs.map(([key, n]) => `${label(key).toLocaleLowerCase()} ${n}`).join(', ');
  const stoolText = ({ period }: ReportDiapers) =>
    [
      ...(period.colors.length ? [`${t('diaper.color')}: ${counts(period.colors, (c) => t(`diaper.colors.${c as StoolColor}`))}`] : []),
      ...(period.textures.length
        ? [`${t('diaper.texture')}: ${counts(period.textures, (x) => t(`diaper.textures.${x as StoolTexture}`))}`]
        : []),
    ].join(' · ');
  const diaperLines = (d: ReportDiapers) => [
    ...(d.period.rash > 0 ? [t('report.rashDays', { count: d.period.rash })] : []),
    ...(stoolText(d) ? [t('report.stool', { list: stoolText(d) })] : []),
  ];
  const notes = openNotesFor(data.notes, slots, includeMother);
  const vaccines = vaccinesInPeriod(data.vaccines, slots, days[0], lastDay);
  const foodNames = new Map(data.foods.map((f) => [f.id, label(f)]));
  const tries = triesInPeriod(data.foodTries, slots, days[0], lastDay);
  const tryText = (tr: (typeof tries)[number]) =>
    [dayLabel(tr.date), name(tr.babyId), foodNames.get(tr.foodId) ?? '?', t(`foods.reaction.${tr.reaction}`), tr.note]
      .filter(Boolean)
      .join(' · ');
  const motherMeds = motherMedsBetween(data.motherLogs, localDay(days[0]).from, localDay(lastDay).to);
  const showMotherMeds = includeMotherMeds && motherMeds.length > 0;
  const motherMedText = (m: (typeof motherMeds)[number]) =>
    [format(new Date(m.start), 'EEE d MMM HH:mm', { locale }), m.data.name, m.data.dose].filter(Boolean).join(' · ');
  const doseText = (v: Vaccine) => (v.dose === null ? '' : t('vaccines.doseShort', { dose: v.dose }));
  const vaccineText = (v: Vaccine) => [dayLabel(v.date), name(v.babyId), v.name, doseText(v), v.place].filter(Boolean).join(' · ');
  // In a report about the twins, a question for the mother says so.
  const noteText = (n: DoctorNote) => (n.babies === 'none' ? `${t('notes.forMother')}: ${n.text}` : n.text);
  const hasMotherNotes = data.notes.some((n) => n.babies === 'none' && n.reviewedAt === null);
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
    ...perTwin.flatMap(({ slot, rows, diapers }) => [
      '',
      name(slot),
      // A day with a rash noted says so, like the table's rash column.
      ...rows.map((r, i) => {
        const rash = diapers.rashByDay[i];
        return `${dayLabel(r.date)}: ${line(r.summary)}${rash > 0 ? ` · ${t('report.col.rash')} ${rash}` : ''}`;
      }),
      ...diaperLines(diapers),
    ]),
    ...(tries.length ? ['', t('report.foods'), ...tries.map((tr) => `• ${tryText(tr)}`)] : []),
    ...(showMotherMeds ? ['', t('report.motherMeds'), ...motherMeds.map((m) => `• ${motherMedText(m)}`)] : []),
    ...(vaccines.length ? ['', t('report.vaccines'), ...vaccines.map((v) => `• ${vaccineText(v)}`)] : []),
    ...(notes.length ? ['', t('report.notes'), ...notes.map((n) => `• ${noteText(n)}`)] : []),
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
        {hasMotherNotes && <Toggle label={t('report.includeMother')} checked={includeMother} onChange={setIncludeMother} />}
        {motherMeds.length > 0 && (
          <Toggle label={t('report.includeMotherMeds')} checked={includeMotherMeds} onChange={setIncludeMotherMeds} />
        )}
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

        {perTwin.map(({ slot, rows, total, diapers, showRash }) => (
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
                    {showRash && <th className={head}>{t('report.col.rash')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ date, summary: s }, i) => (
                    <tr key={date}>
                      <td className={`${cell} text-left`}>{dayLabel(date)}</td>
                      <td className={cell}>{s.feeds}</td>
                      <td className={cell}>{s.ml}</td>
                      <td className={cell}>{s.breastMinutes}</td>
                      <td className={cell}>{s.wet}</td>
                      <td className={cell}>{s.dirty}</td>
                      <td className={cell}>{hours(s.sleepMinutes)}</td>
                      <td className={cell}>{s.meds}</td>
                      {showRash && <td className={cell}>{diapers.rashByDay[i]}</td>}
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
                    {showRash && <td className={cell}>{formatNumber(diapers.period.rash / rows.length, i18n.language)}</td>}
                  </tr>
                </tfoot>
              </table>
            </div>
            {stoolText(diapers) && <p>{t('report.stool', { list: stoolText(diapers) })}</p>}
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
                <th className={head}>{t('growth.head')}</th>
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
                    <td className={cell}>{p.headCm === null ? '–' : formatNumber(p.headCm, i18n.language)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </section>

        {tries.length > 0 && (
          <section className="space-y-2 break-inside-avoid-page">
            <h3 className="text-base font-semibold">{t('report.foods')}</h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className={head}>{t('report.col.date')}</th>
                  <th className={head}>{t('report.col.twin')}</th>
                  <th className={head}>{t('report.col.food')}</th>
                  <th className={head}>{t('foods.reactionLabel')}</th>
                  <th className={head}>{t('foods.note')}</th>
                </tr>
              </thead>
              <tbody>
                {tries.map((tr) => (
                  <tr key={tr.id}>
                    <td className={`${cell} text-left`}>{dayLabel(tr.date)}</td>
                    <td className={`${cell} text-left`}>{name(tr.babyId)}</td>
                    <td className={`${cell} text-left`}>{foodNames.get(tr.foodId) ?? '–'}</td>
                    <td className={`${cell} text-left`}>{t(`foods.reaction.${tr.reaction}`)}</td>
                    <td className={`${cell} text-left`}>{tr.note || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {showMotherMeds && (
          <section className="space-y-2 break-inside-avoid-page">
            <h3 className="text-base font-semibold">{t('report.motherMeds')}</h3>
            <ul className="list-disc space-y-1 pl-5">
              {motherMeds.map((m) => (
                <li key={m.id}>{motherMedText(m)}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-2 break-inside-avoid-page">
          <h3 className="text-base font-semibold">{t('report.vaccines')}</h3>
          {vaccines.length === 0 ? (
            <p className="text-muted">{t('report.noVaccines')}</p>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className={head}>{t('report.col.date')}</th>
                  <th className={head}>{t('report.col.twin')}</th>
                  <th className={head}>{t('report.col.vaccine')}</th>
                  <th className={head}>{t('report.col.dose')}</th>
                  <th className={head}>{t('report.col.place')}</th>
                </tr>
              </thead>
              <tbody>
                {vaccines.map((v) => (
                  <tr key={v.id}>
                    <td className={`${cell} text-left`}>{dayLabel(v.date)}</td>
                    <td className={`${cell} text-left`}>{name(v.babyId)}</td>
                    <td className={`${cell} text-left`}>{v.name}</td>
                    <td className={cell}>{v.dose ?? '–'}</td>
                    <td className={`${cell} text-left`}>{v.place || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="space-y-2 break-inside-avoid-page">
          <h3 className="text-base font-semibold">{t('report.notes')}</h3>
          {notes.length === 0 ? (
            <p className="text-muted">{t('report.noNotes')}</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5">
              {notes.map((n) => (
                <li key={n.id}>{noteText(n)}</li>
              ))}
            </ul>
          )}
        </section>

        <p className="border-t border-line pt-2 text-xs text-muted">{t('report.disclaimer')}</p>
      </article>
    </Page>
  );
}
