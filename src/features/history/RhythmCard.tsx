import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, format, parseISO } from 'date-fns';
import { ChartFrame, ChartTable, seriesFill, type ChartSeries } from '@/components/charts/ChartFrame';
import { Segmented } from '@/components/ui';
import { useLive, useSettings } from '@/data/StoreContext';
import type { ISODate, TwinSlot } from '@/data/types';
import { dateLocale } from '@/i18n';
import { useFormatMinutes } from '@/lib/useNow';
import { SLOTS } from '@/features/log/logic';
import { colorOf, useTwinName, type Babies } from '@/features/twins/twins';
import { daysEnding, localDay } from './summary';
import { buildRows, minuteOfDay, nightBands, sleptMinutes, type InStep, type RhythmRow as Row } from './rhythm';

const W = 320;
/** Room for the twin's letter on the left of each bar. */
const L = 16;
const BAR = 14;
const GAP = 2;
const GRID_HOURS = ['00:00', '06:00', '12:00', '18:00'];

type Period = '7' | '14';

/**
 * The twins' 24-hour pattern, one pair of bars per day (A above B, newest day on top):
 * sleep as filled blocks, feed starts as lines, night hours shaded. Tap a day to open it.
 */
export function RhythmCard({
  lastDay,
  babies,
  now,
  onOpenDay,
}: {
  lastDay: ISODate;
  babies: Babies;
  now: Date;
  onOpenDay: (day: ISODate) => void;
}) {
  const { t, i18n } = useTranslation();
  const settings = useSettings();
  const name = useTwinName(babies);
  const fmt = useFormatMinutes();
  const [period, setPeriod] = useState<Period>('7');
  const days = daysEnding(lastDay, Number(period));
  const entries = useLive(
    (s) => s.logs.listBetween(addDays(parseISO(days[0]), -1).toISOString(), localDay(lastDay).to.toISOString()),
    [lastDay, period],
  );
  if (!entries || !settings) return null;

  const locale = dateLocale(i18n.language);
  const rows: Row[] = buildRows(entries, days, now, settings.rhythmTogetherMin).reverse();
  const letter = (slot: TwinSlot) => (slot === 'A' ? t('twins.letterA') : t('twins.letterB'));
  const series: ChartSeries[] = SLOTS.map((slot) => ({ id: slot, slot, label: name(slot), color: colorOf(babies, slot) }));
  const stepLine = (s: InStep) =>
    t('history.rhythm.inStep', {
      duration: fmt(s.sharedSleepMin),
      together: s.feedsTogether,
      a: name('A'),
      b: name('B'),
      feedsA: s.feedsA,
      feedsB: s.feedsB,
    });

  const chart = (
    <div>
      <svg viewBox={`0 0 ${W} 14`} className="block w-full" aria-hidden>
        {[0, 6, 12, 18, 24].map((h) => (
          <text
            key={h}
            x={L + (h / 24) * (W - L)}
            y={10}
            fontSize={9}
            fill="var(--c-muted)"
            textAnchor={h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}
          >
            {String(h).padStart(2, '0')}
          </text>
        ))}
      </svg>
      <ul className="space-y-1">
        {rows.map((row) => {
          const date = format(parseISO(row.day), 'EEE d MMM', { locale });
          const label = t('history.rhythm.dayLabel', {
            date: format(parseISO(row.day), 'EEEE d MMMM', { locale }),
            a: name('A'),
            b: name('B'),
            sleepA: fmt(sleptMinutes(row.twins.A)),
            sleepB: fmt(sleptMinutes(row.twins.B)),
            feedsA: row.twins.A.feeds.length,
            feedsB: row.twins.B.feeds.length,
            inStep: stepLine(row.step),
          });
          return (
            <li key={row.day}>
              <button
                type="button"
                onClick={() => onOpenDay(row.day)}
                aria-label={label}
                aria-current={row.day === lastDay ? 'date' : undefined}
                className="block min-h-12 w-full rounded-lg px-1 py-1 text-left hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-accent aria-[current=date]:ring-1 aria-[current=date]:ring-line"
              >
                <span className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="font-semibold">{date}</span>
                  <span className="text-muted">{stepLine(row.step)}</span>
                </span>
                <DayBars row={row} babies={babies} now={now} night={settings.nightHours} letter={letter} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const table = (
    <ChartTable
      head={[
        t('history.rhythm.day'),
        t('history.rhythm.sleepOf', { name: name('A') }),
        t('history.rhythm.feedsOf', { name: name('A') }),
        t('history.rhythm.sleepOf', { name: name('B') }),
        t('history.rhythm.feedsOf', { name: name('B') }),
        t('history.rhythm.sharedSleep'),
        t('history.rhythm.together'),
      ]}
      rows={rows.map((row) => [
        format(parseISO(row.day), 'EEE d MMM', { locale }),
        fmt(sleptMinutes(row.twins.A)),
        row.twins.A.feeds.length,
        fmt(sleptMinutes(row.twins.B)),
        row.twins.B.feeds.length,
        fmt(row.step.sharedSleepMin),
        row.step.feedsTogether,
      ])}
    />
  );

  return (
    <ChartFrame
      title={t('history.rhythm.title')}
      series={series}
      chart={chart}
      table={table}
      note={t('history.rhythm.legend')}
      controls={
        <Segmented<Period>
          label={t('history.rhythm.period')}
          hideLabel
          value={period}
          options={(['7', '14'] as const).map((p) => ({ value: p, label: t('history.rhythm.days', { count: Number(p) }) }))}
          onChange={setPeriod}
        />
      }
    />
  );
}

/** Two bars (A above B) for one day. Decorative: the button around it carries the description. */
function DayBars({
  row,
  babies,
  now,
  night,
  letter,
}: {
  row: Row;
  babies: Babies;
  now: Date;
  night: { from: string; to: string };
  letter: (slot: TwinSlot) => string;
}) {
  const { length } = row.twins.A;
  const x = (minute: number) => L + (Math.min(Math.max(minute, 0), length) / length) * (W - L);
  const { from, to } = localDay(row.day);
  // Today ends at "now": what has not happened yet stays blank.
  const shown = now < to ? Math.max(0, (now.getTime() - from.getTime()) / 60_000) : length;
  const bands = nightBands(row.day, night, length);
  const grid = GRID_HOURS.map((h) => minuteOfDay(row.day, h));
  const height = BAR * 2 + GAP;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="mt-0.5 block w-full" aria-hidden>
      {SLOTS.map((slot, i) => {
        const y = i * (BAR + GAP);
        const fill = seriesFill(colorOf(babies, slot));
        return (
          <g key={slot}>
            <text x={0} y={y + BAR - 2} fontSize={9} fontWeight={700} fill="var(--c-muted)">
              {letter(slot)}
            </text>
            <rect x={L} y={y} width={x(shown) - L} height={BAR} fill="var(--c-surface-2)" />
            {bands.map(([a, b]) => (
              <rect
                key={a}
                x={x(a)}
                y={y}
                width={Math.max(0, x(Math.min(b, shown)) - x(a))}
                height={BAR}
                fill="var(--c-ink)"
                opacity={0.14}
              />
            ))}
            {grid.map((m) => (
              <line key={m} x1={x(m)} x2={x(m)} y1={y} y2={y + BAR} stroke="var(--c-line)" strokeWidth={1} />
            ))}
            {row.twins[slot].sleeps.map((s, k) => (
              <rect
                key={`${s.from}-${k}`}
                x={x(s.from)}
                y={y + 1}
                width={Math.max(1, x(s.to) - x(s.from))}
                height={BAR - 2}
                rx={2}
                fill={fill}
              />
            ))}
            {row.twins[slot].feeds.map((f, k) => (
              <line
                key={k}
                x1={x(f.at)}
                x2={x(f.at)}
                // A feed logged for both twins reaches across the gap, so the two rows join into one line.
                y1={f.linked && i === 1 ? y - GAP : y}
                y2={f.linked && i === 0 ? y + BAR + GAP : y + BAR}
                stroke="var(--c-ink)"
                strokeWidth={1.5}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
