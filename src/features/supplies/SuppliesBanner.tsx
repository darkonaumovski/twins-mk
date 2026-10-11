import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, PackagePlus, ShoppingCart } from 'lucide-react';
import { supplyStatus } from './logic';
import { useDaysLeftText, useSupplyActions, useSupplyAmount, useSupplyData } from './useSupplies';

/** On Today: a calm note for each supply running low, with "+ pack" and "Add to shopping list". */
export function SuppliesBanner({ now }: { now: Date }) {
  const { t } = useTranslation();
  const data = useSupplyData();
  const amount = useSupplyAmount();
  const daysLeft = useDaysLeftText();
  const { restock, addToShopping } = useSupplyActions();
  if (!data) return null;

  const low = (['diapers', 'formula'] as const).flatMap((source) => {
    const supply = data.supplies[source];
    if (!supply) return [];
    const status = supplyStatus(supply, data.entries, now);
    return status.low ? [{ source, supply, status }] : [];
  });
  if (low.length === 0) return null;

  return (
    <section aria-label={t('supplies.title')} className="space-y-2">
      {low.map(({ source, supply, status }) => (
        <div key={source} className="space-y-2 rounded-2xl border border-warn/40 bg-surface p-3">
          <Link to="/supplies" className="flex items-start gap-2">
            <AlertTriangle aria-hidden size={20} className="mt-0.5 shrink-0 text-warn" />
            <span>
              <span className="block font-semibold">
                {t(`supplies.${source}`)}: {amount(supply, status.remaining)}
              </span>
              <span className="block text-sm text-muted">{daysLeft(status)}</span>
            </span>
          </Link>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => restock(supply, data.entries)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-sm font-semibold"
            >
              <PackagePlus aria-hidden size={18} />
              {source === 'diapers' ? t('supplies.addPack') : t('supplies.addTin')}
            </button>
            {data.onShoppingList[source] ? (
              <span className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-medium text-ok">
                <Check aria-hidden size={18} />
                {t('supplies.onShoppingList')}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => addToShopping(source)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-sm font-semibold"
              >
                <ShoppingCart aria-hidden size={18} />
                {t('supplies.addToShopping')}
              </button>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
