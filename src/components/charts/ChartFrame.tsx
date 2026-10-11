import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, Table2 } from 'lucide-react';
import { IconButton } from '@/components/Button';
import { TwinBadge } from '@/features/twins/twins';
import type { TwinColor, TwinSlot } from '@/data/types';

export interface ChartSeries {
  id: string;
  label: string;
  slot: TwinSlot;
  color: TwinColor;
}

/**
 * Title, legend (badge + name, so identity never relies on colour alone) and a
 * chart/table switch. The table is the accessible view of the same numbers.
 */
export function ChartFrame({ title, series, chart, table }: { title: string; series: ChartSeries[]; chart: ReactNode; table: ReactNode }) {
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
              <TwinBadge slot={s.slot} color={s.color} size="sm" />
              {s.label}
            </li>
          ))}
        </ul>
      )}
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
