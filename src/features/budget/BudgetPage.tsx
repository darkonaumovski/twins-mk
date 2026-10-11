import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Info } from 'lucide-react';
import { Button } from '@/components/Button';
import { ProgressBar } from '@/components/ProgressBar';
import { Page, cx } from '@/components/ui';
import { useSettings } from '@/data/StoreContext';
import { useLabel } from '@/lib/labels';
import { formatMoney } from '@/lib/format';
import type { PrepItem } from '@/data/types';
import { ItemEditor } from '@/features/checklist/ItemEditor';
import { nextItemOrder, useChecklistData } from '@/features/checklist/useChecklistData';
import { budgetByCategory, budgetTotals, missingActualPrices, missingEstimates } from './logic';

const PREVIEW = 5;

function StatTile({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={cx('rounded-2xl p-4', emphasis ? 'bg-accent-soft' : 'border border-line bg-surface')}>
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

export function BudgetPage() {
  const { t, i18n } = useTranslation();
  const label = useLabel();
  const settings = useSettings();
  const data = useChecklistData();
  const [editing, setEditing] = useState<PrepItem | null>(null);
  const [showAllMissing, setShowAllMissing] = useState(false);

  if (!data || !settings) return null;

  const money = (n: number) => formatMoney(n, settings.currency, i18n.language);
  const totals = budgetTotals(data.items);
  const rows = budgetByCategory(
    data.items,
    data.categories.map((c) => c.id),
  ).filter((r) => r.planned > 0 || r.spent > 0);
  const missing = missingEstimates(data.items, 'must');
  const missingActual = missingActualPrices(data.items);
  const hasAnyPrice = totals.planned > 0 || totals.spent > 0;
  const shownMissing = showAllMissing ? missing : missing.slice(0, PREVIEW);
  const spentPct = totals.projected > 0 ? Math.round((totals.spent / totals.projected) * 100) : 0;

  return (
    <Page title={t('budget.title')}>
      {hasAnyPrice ? (
        <>
          <section className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <StatTile label={t('budget.remainingMust')} value={money(totals.remainingMust)} emphasis />
              <StatTile label={t('budget.spent')} value={money(totals.spent)} />
              <StatTile label={t('budget.projected')} value={money(totals.projected)} />
              <StatTile label={t('budget.planned')} value={money(totals.planned)} />
            </div>
            <div className="space-y-1.5 rounded-2xl border border-line bg-surface p-4">
              <p className="text-sm font-medium">{t('budget.spentShare', { pct: spentPct })}</p>
              <ProgressBar value={totals.spent} max={totals.projected} label={t('budget.spentMeter')} />
              <p className="text-sm text-muted">{t('budget.remainingNice', { amount: money(totals.remainingNice) })}</p>
            </div>
            <p className="flex gap-2 px-1 text-sm text-muted">
              <Info aria-hidden size={16} className="mt-0.5 shrink-0" />
              <span>
                {t('budget.explain')} {t('budget.currencyNote', { currency: settings.currency })}
              </span>
            </p>
          </section>

          {rows.length > 0 && (
            <section className="space-y-2">
              <h2 className="px-1 text-sm font-semibold tracking-wide text-muted uppercase">{t('budget.byCategory')}</h2>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {rows.map((r) => {
                  const category = data.categories.find((c) => c.id === r.categoryId)!;
                  const name = label(category);
                  const left = r.remainingMust + r.remainingNice;
                  return (
                    <li key={r.categoryId}>
                      <Link
                        to={`/checklist?cat=${encodeURIComponent(r.categoryId)}`}
                        aria-label={t('budget.openCategory', { name })}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <span className="flex-1 space-y-1.5">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="font-medium">{name}</span>
                            <span className="font-semibold tabular-nums">{money(r.projected)}</span>
                          </span>
                          <ProgressBar value={r.spent} max={r.projected} label={t('budget.categoryMeter', { name })} />
                          <span className="block text-sm text-muted">
                            {t('budget.categoryLine', { spent: money(r.spent), left: money(left) })}
                          </span>
                        </span>
                        <ChevronRight aria-hidden size={20} className="shrink-0 text-muted" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      ) : (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">{t('budget.empty')}</p>
      )}

      {missing.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold tracking-wide text-muted uppercase">{t('budget.addPrices')}</h2>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <p className="flex gap-2 px-4 pt-3 pb-2 text-sm text-warn">
              <Info aria-hidden size={16} className="mt-0.5 shrink-0" />
              {t('budget.needEstimate', { count: missing.length })}
            </p>
            <ul className="divide-y divide-line border-t border-line">
              {shownMissing.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(item)}
                    className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left"
                  >
                    <span className="flex-1">{label(item)}</span>
                    <ChevronRight aria-hidden size={18} className="text-muted" />
                  </button>
                </li>
              ))}
            </ul>
            {missing.length > PREVIEW && (
              <Button variant="ghost" className="w-full rounded-none border-t border-line" onClick={() => setShowAllMissing((v) => !v)}>
                {showAllMissing ? t('budget.showLess') : t('budget.showAll', { count: missing.length })}
              </Button>
            )}
          </div>
        </section>
      )}

      {missingActual.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-line bg-surface">
          <p className="flex gap-2 px-4 pt-3 pb-2 text-sm text-muted">
            <Info aria-hidden size={16} className="mt-0.5 shrink-0" />
            {t('budget.needActual', { count: missingActual.length })}
          </p>
          <ul className="divide-y divide-line border-t border-line">
            {missingActual.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setEditing(item)}
                  className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left"
                >
                  <span className="flex-1">{label(item)}</span>
                  <ChevronRight aria-hidden size={18} className="text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <ItemEditor
          item={editing}
          categories={data.categories}
          defaultCategoryId={editing.categoryId}
          dueDate={settings.dueDate}
          nextOrder={nextItemOrder(data.items)}
          onClose={() => setEditing(null)}
          openDetails
        />
      )}
    </Page>
  );
}
