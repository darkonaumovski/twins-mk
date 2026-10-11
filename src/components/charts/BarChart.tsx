import { useCallback, useRef, useState } from 'react';
import { barPath, linear, niceTicks } from './scale';
import { ChartFrame, ChartTable, SeriesMark, seriesFill, type ChartSeries } from './ChartFrame';
import { useOutsideTap } from './useOutsideTap';

export interface BarSeries extends ChartSeries {
  values: number[];
}

const W = 340;
const M = { top: 8, right: 4, bottom: 22, left: 34 };
const GAP = 2;

/**
 * Grouped bars: one group per day, one bar per twin. Thin bars with rounded
 * tops on a flat baseline, a recessive grid, and a tooltip per day that works
 * with mouse, touch (tap) and keyboard (focus).
 */
export function BarChart({
  title,
  categories,
  series,
  format,
  height = 170,
}: {
  title: string;
  /** `short` labels the axis, `long` is used in tooltips and the table. */
  categories: { short: string; long: string }[];
  series: BarSeries[];
  format: (v: number) => string;
  height?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const pointer = useRef('mouse');
  useOutsideTap(
    container,
    active !== null,
    useCallback(() => setActive(null), []),
  );
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(0, max, 3);
  const top = ticks.at(-1)!;
  const baseline = height - M.bottom;
  const y = linear(0, top, baseline, M.top);
  const band = (W - M.left - M.right) / categories.length;
  const pad = band * 0.22;
  const barW = (band - pad - GAP * (series.length - 1)) / series.length;
  const describe = (i: number) => `${categories[i].long}: ${series.map((s) => `${s.label} ${format(s.values[i])}`).join(', ')}`;

  const chart = (
    <div
      ref={container}
      className="relative"
      onPointerDown={(e) => (pointer.current = e.pointerType)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
    >
      <svg viewBox={`0 0 ${W} ${height}`} className="block w-full overflow-visible" role="group" aria-label={title}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={M.left} x2={W - M.right} y1={y(tick)} y2={y(tick)} stroke="var(--c-line)" strokeWidth={1} />
            <text x={M.left - 6} y={y(tick)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--c-muted)">
              {format(tick)}
            </text>
          </g>
        ))}
        {categories.map((c, i) => {
          const x0 = M.left + i * band;
          return (
            <g key={i}>
              {active === i && <rect x={x0 + 1} y={M.top} width={band - 2} height={baseline - M.top} rx={4} fill="var(--c-surface-2)" />}
              {series.map((s, si) => {
                const x = x0 + pad / 2 + si * (barW + GAP);
                return <path key={s.id} d={barPath(x, y(s.values[i]), barW, baseline)} fill={seriesFill(s.color)} />;
              })}
              <text x={x0 + band / 2} y={height - 6} textAnchor="middle" fontSize={10} fill="var(--c-muted)">
                {c.short}
              </text>
              {/* Hit target: the whole day column, larger than the bars. */}
              <rect
                x={x0}
                y={0}
                width={band}
                height={height}
                fill="transparent"
                tabIndex={0}
                role="img"
                aria-label={describe(i)}
                className="cursor-pointer outline-none focus-visible:stroke-accent focus-visible:stroke-2"
                onPointerEnter={(e) => e.pointerType === 'mouse' && setActive(i)}
                // Mouse: hover shows it. Touch: a tap toggles it.
                onClick={() => setActive((a) => (pointer.current !== 'mouse' && a === i ? null : i))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
            </g>
          );
        })}
        <line x1={M.left} x2={W - M.right} y1={baseline} y2={baseline} stroke="var(--c-muted)" strokeWidth={1} />
      </svg>
      {active !== null && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 z-10 min-w-36 -translate-x-1/2 rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-lg"
          style={{ left: `clamp(4.5rem, ${((M.left + (active + 0.5) * band) / W) * 100}%, calc(100% - 4.5rem))` }}
        >
          <p className="mb-1 font-semibold">{categories[active].long}</p>
          {series.map((s) => (
            <p key={s.id} className="flex items-center gap-2">
              <SeriesMark series={s} />
              <span className="flex-1 truncate">{s.label}</span>
              <span className="font-semibold tabular-nums">{format(s.values[active])}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );

  const table = (
    <ChartTable
      head={['', ...series.map((s) => s.label)]}
      rows={categories.map((c, i) => [c.long, ...series.map((s) => format(s.values[i]))])}
    />
  );

  return <ChartFrame title={title} series={series} chart={chart} table={table} />;
}
