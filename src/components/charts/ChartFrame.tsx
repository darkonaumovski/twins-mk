import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, Table2 } from 'lucide-react';
import { IconButton } from '@/components/Button';
import { TwinBadge } from '@/features/twins/twins';
import type { TwinColor, TwinSlot } from '@/data/types';

export interface ChartSeries {
  id: string;
  label: string;
  /** The twin this series belongs to; absent for a series about someone else (e.g. pumping). */
  slot?: TwinSlot;
  /** A twin colour, or `accent` for a series that is not about a twin. */
  color: TwinColor | 'accent';
}

/** Fill colour for a series. */
export function seriesFill(color: ChartSeries['color']): string {
  return color === 'accent' ? 'var(--c-accent)' : `var(--twin-${color})`;
}

/** The twin's badge, or a plain dot for a series that is not about a twin. */
export function SeriesMark({ series }: { series: ChartSeries }) {
  if (series.slot && series.color !== 'accent') return <TwinBadge slot={series.slot} color={series.color} size="sm" />;
  return <span aria-hidden className="inline-block size-3 shrink-0 rounded-full" style={{ background: seriesFill(series.color) }} />;
}

/**
 * Title, legend (badge + name, so identity never relies on colour alone) and a
 * chart/table switch. The table is the accessible view of the same numbers.
 */
export function ChartFrame({
  title,
  series,
  chart,
  table,
  controls,
  note,
}: {
  title: string;
  series: ChartSeries[];
  chart: ReactNode;
  table: ReactNode;
  /** Extra controls under the title, such as a period switch. */
  controls?: ReactNode;
  /** A short line under the legend, e.g. what the marks mean. */
  note?: ReactNode;
}) {
  const { t } = useTranslation();
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-start gap-2">
        <h3 id={titleId} className="flex-1 pt-3 font-semibold">
          {title}
        </h3>
        <IconButton
          label={asTable ? t('history.showChart') : t('history.showTable')}
          onClick={() => setAsTable((v) => !v)}
          className="text-muted"
        >
          {asTable ? <BarChart3 aria-hidden size={20} /> : <Table2 aria-hidden size={20} />}
        </IconButton>
      </div>
      {series.length > 1 && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {series.map((s) => (
            <li key={s.id} className="flex items-center gap-1.5">
              <SeriesMark series={s} />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      {controls && <div className="mb-3">{controls}</div>}
      {note && !asTable && <p className="mb-2 text-xs text-muted">{note}</p>}
      {asTable ? <div className="overflow-x-auto">{table}</div> : chart}
    </section>
  );
}

export function ChartTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr className="border-b border-line text-left text-muted">
          {head.map((h, i) => (
            <th key={i} scope="col" className="py-1.5 pr-3 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r} className="border-b border-line/60 last:border-0">
            {row.map((cell, c) =>
              c === 0 ? (
                <th key={c} scope="row" className="py-1.5 pr-3 text-left font-medium">
                  {cell}
                </th>
              ) : (
                <td key={c} className="py-1.5 pr-3">
                  {cell}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
