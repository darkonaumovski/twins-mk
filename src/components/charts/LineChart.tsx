import { useCallback, useId, useRef, useState, type PointerEvent } from 'react';
import { linear, niceTicks } from './scale';
import { ChartFrame, ChartTable, SeriesMark, seriesFill, type ChartSeries } from './ChartFrame';
import { useOutsideTap } from './useOutsideTap';

export interface LinePoint {
  /** Time in ms. */
  t: number;
  v: number;
}

export interface LineSeries extends ChartSeries {
  points: LinePoint[];
}

/** A thin neutral line drawn behind the series (e.g. a reference curve). Not in the tooltip or the table. */
export interface ReferenceLine {
  id: string;
  points: LinePoint[];
}

const W = 340;
const H = 200;
const M = { top: 10, right: 10, bottom: 24, left: 44 };
const DAY = 24 * 3600_000;

/** A line's values inside [t0, t1], plus where it crosses each edge, so a sparse line is never cut off above or below. */
export function visibleValues(points: readonly LinePoint[], t0: number, t1: number): number[] {
  const at = (t: number) => {
    const i = points.findIndex((p) => p.t >= t);
    if (i <= 0) return i === 0 ? points[0].v : null;
    const a = points[i - 1];
    const b = points[i];
    return a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
  };
  const inside = points.filter((p) => p.t >= t0 && p.t <= t1).map((p) => p.v);
  return [...inside, at(t0), at(t1)].filter((v): v is number => v !== null);
}

/**
 * Values over time for both twins on one shared axis: 2px lines, 8px markers
 * with a surface ring, and a crosshair tooltip at the nearest measurement.
 */
export function LineChart({
  title,
  series,
  format,
  formatDate,
  tableHead,
  reference = [],
  domain,
  day = DAY,
  formatTick = formatDate,
}: {
  title: string;
  series: LineSeries[];
  format: (v: number) => string;
  formatDate: (t: number) => string;
  /** First column header of the table view. */
  tableHead: string;
  reference?: ReferenceLine[];
  /** The x range to show; by default the measurements' own range. */
  domain?: [number, number];
  /** One day in x units: ms for dates (the default), 1 when x is an age in days. */
  day?: number;
  /** Labels under the x axis, if they should be shorter than `formatDate` (used in the tooltip and table). */
  formatTick?: (t: number) => string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const container = useRef<HTMLDivElement>(null);
  useOutsideTap(
    container,
    hoverT !== null,
    useCallback(() => setHoverT(null), []),
  );
  const all = series.flatMap((s) => s.points);
  const times = [...new Set(all.map((p) => p.t))].sort((a, b) => a - b);
  let t0 = domain?.[0] ?? Math.min(...times);
  let t1 = domain?.[1] ?? Math.max(...times);
  if (t1 - t0 < day) {
    t0 -= day;
    t1 += day;
  }
  // The value axis also fits the reference lines where they are visible.
  const values = [...all.map((p) => p.v), ...reference.flatMap((r) => visibleValues(r.points, t0, t1))];
  const ticks = niceTicks(Math.min(...values), Math.max(...values), 4);
  const x = linear(t0, t1, M.left, W - M.right);
  const y = linear(ticks[0], ticks.at(-1)!, H - M.bottom, M.top);
  // Up to four evenly spaced dates, without repeating a label on short ranges.
  const xTicks = [0, 1 / 3, 2 / 3, 1]
    .map((f) => t0 + f * (t1 - t0))
    .filter((t, i, all) => i === 0 || formatTick(t) !== formatTick(all[i - 1]));

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const t = t0 + ((vx - M.left) / (W - M.left - M.right)) * (t1 - t0);
    setHoverT(times.reduce((best, cur) => (Math.abs(cur - t) < Math.abs(best - t) ? cur : best), times[0]));
  };

  /** Each twin's measurement on the hovered day, if it has one. */
  const atHover = hoverT === null ? [] : series.map((s) => ({ s, p: s.points.find((p) => Math.abs(p.t - hoverT) < day / 2) }));
  // useId contains characters that are not safe inside url(#…).
  const clipId = `clip-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;

  const chart = (
    <div ref={container} className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full touch-pan-y overflow-visible"
        role="img"
        aria-label={title}
        onPointerMove={onMove}
        onPointerDown={onMove}
        // Touch keeps the tooltip after lifting the finger; a tap outside closes it.
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHoverT(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={M.left} x2={W - M.right} y1={y(tick)} y2={y(tick)} stroke="var(--c-line)" strokeWidth={1} />
            <text x={M.left - 6} y={y(tick)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--c-muted)">
              {format(tick)}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text
            key={i}
            x={x(t)}
            y={H - 6}
            textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
            fontSize={10}
            fill="var(--c-muted)"
          >
            {formatTick(t)}
          </text>
        ))}
        {reference.length > 0 && (
          <>
            <clipPath id={clipId}>
              <rect x={M.left} y={M.top} width={W - M.left - M.right} height={H - M.top - M.bottom} />
            </clipPath>
            <g clipPath={`url(#${clipId})`} aria-hidden>
              {reference.map((r) => (
                <polyline
                  key={r.id}
                  points={r.points.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')}
                  fill="none"
                  stroke="var(--c-muted)"
                  strokeOpacity={0.55}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
              ))}
            </g>
          </>
        )}
        {hoverT !== null && (
          <line x1={x(hoverT)} x2={x(hoverT)} y1={M.top} y2={H - M.bottom} stroke="var(--c-muted)" strokeDasharray="3 3" />
        )}
        {series.map((s) => (
          <g key={s.id}>
            {s.points.length > 1 && (
              <polyline
                points={s.points.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')}
                fill="none"
                stroke={seriesFill(s.color)}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {s.points.map((p) => (
              <circle key={p.t} cx={x(p.t)} cy={y(p.v)} r={4} fill={seriesFill(s.color)} stroke="var(--c-surface)" strokeWidth={2} />
            ))}
          </g>
        ))}
      </svg>
      {hoverT !== null && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 z-10 min-w-36 -translate-x-1/2 rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-lg"
          style={{ left: `clamp(4.5rem, ${(x(hoverT) / W) * 100}%, calc(100% - 4.5rem))` }}
        >
          <p className="mb-1 font-semibold">{formatDate(hoverT)}</p>
          {atHover.map(
            ({ s, p }) =>
              p && (
                <p key={s.id} className="flex items-center gap-2">
                  <SeriesMark series={s} />
                  <span className="flex-1 truncate">{s.label}</span>
                  <span className="font-semibold tabular-nums">{format(p.v)}</span>
                </p>
              ),
          )}
        </div>
      )}
    </div>
  );

  const table = (
    <ChartTable
      head={[tableHead, ...series.map((s) => s.label)]}
      rows={times.map((t) => [
        formatDate(t),
        ...series.map((s) => {
          const p = s.points.find((q) => q.t === t);
          return p ? format(p.v) : '–';
        }),
      ])}
    />
  );

  return <ChartFrame title={title} series={series} chart={chart} table={table} />;
}
