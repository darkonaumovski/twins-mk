import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Package, PackagePlus, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/Button';
import { Stepper } from '@/components/Stepper';
import { Page } from '@/components/ui';
import { useStore } from '@/data/StoreContext';
import type { LogEntry, Supply, SupplySource } from '@/data/types';
import { SUPPLY_IDS, supplyStatus } from './logic';
import { useDaysLeftText, useSupplyActions, useSupplyAmount, useSupplyData } from './useSupplies';

function SetupForm({ source, supply, current, onDone }: { source: SupplySource; supply?: Supply; current?: number; onDone: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const diapers = source === 'diapers';
  const [packSize, setPackSize] = useState(supply?.packSize ?? (diapers ? 50 : 0));
  // Diapers are counted in pieces, formula in tins (stored as ml of prepared formula).
  const [count, setCount] = useState(() => {
    if (current === undefined) return 0;
    return diapers ? Math.round(current) : supply?.packSize ? Math.round(current / supply.packSize) : 0;
  });
  const [threshold, setThreshold] = useState(supply?.lowThresholdDays ?? 3);
  const [error, setError] = useState(false);

  const save = async () => {
    if (packSize <= 0) return setError(true);
    const fields = {
      source,
      stock: diapers ? count : Math.round(count * packSize),
      countedAt: new Date().toISOString(),
      packSize,
      lowThresholdDays: threshold,
    };
    if (supply) await store.supplies.update(supply.id, fields);
    else await store.supplies.create({ ...fields, id: SUPPLY_IDS[source] });
    onDone();
  };

  return (
    <div className="space-y-4">
      <Stepper
        label={diapers ? t('supplies.packSizeDiapers') : t('supplies.packSizeFormula')}
        hint={diapers ? undefined : t('supplies.packSizeFormulaHint')}
        value={packSize}
        min={0}
        max={diapers ? 300 : 20000}
        step={diapers ? 1 : 50}
        onChange={(v) => {
          setPackSize(v);
          setError(false);
        }}
      />
      <Stepper
        label={diapers ? t('supplies.countDiapers') : t('supplies.countTins')}
        value={count}
        min={0}
        max={diapers ? 5000 : 100}
        step={1}
        onChange={setCount}
      />
      <Stepper label={t('supplies.threshold')} value={threshold} min={1} max={30} onChange={setThreshold} />
      {error && (
        <p role="alert" className="font-medium text-danger">
          {t('supplies.packSizeRequired')}
        </p>
      )}
      <div className="flex gap-3">
        {supply && (
          <Button variant="secondary" className="flex-1" onClick={onDone}>
            {t('common.cancel')}
          </Button>
        )}
        <Button className="flex-1" onClick={save}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}

function SupplyCard({
  source,
  supply,
  entries,
  onShoppingList,
}: {
  source: SupplySource;
  supply: Supply | undefined;
  entries: LogEntry[];
  onShoppingList: boolean;
}) {
  const { t } = useTranslation();
  const amount = useSupplyAmount();
  const daysLeft = useDaysLeftText();
  const { restock, addToShopping } = useSupplyActions();
  const [editing, setEditing] = useState(false);
  const status = supply ? supplyStatus(supply, entries, new Date()) : null;

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Package aria-hidden size={20} className="text-accent" />
        {t(`supplies.${source}`)}
      </h2>
      {!supply || editing ? (
        <>
          {!supply && <p className="text-sm text-muted">{t(source === 'diapers' ? 'supplies.introDiapers' : 'supplies.introFormula')}</p>}
          <SetupForm source={source} supply={supply} current={status?.remaining} onDone={() => setEditing(false)} />
        </>
      ) : (
        status && (
          <>
            <p className={status.low ? 'text-xl font-bold text-warn' : 'text-xl font-bold'}>{amount(supply, status.remaining)}</p>
            <p className="text-sm text-muted">{daysLeft(status)}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => restock(supply, entries)}>
                <PackagePlus aria-hidden size={20} />
                {source === 'diapers' ? t('supplies.addPack') : t('supplies.addTin')}
              </Button>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                {t('supplies.recount')}
              </Button>
            </div>
            {onShoppingList ? (
              <p className="flex items-center gap-2 text-sm font-medium text-ok">
                <Check aria-hidden size={18} />
                {t('supplies.onShoppingList')}
              </p>
            ) : (
              <Button variant="ghost" className="w-full" onClick={() => addToShopping(source)}>
                <ShoppingCart aria-hidden size={18} />
                {t('supplies.addToShopping')}
              </Button>
            )}
          </>
        )
      )}
    </section>
  );
}

/** Diapers and formula: what is left, how long it lasts at the current pace, restock. */
export function SuppliesPage() {
  const { t } = useTranslation();
  const data = useSupplyData();
  if (!data) return null;
  return (
    <Page title={t('supplies.title')}>
      <p className="text-sm text-muted">{t('supplies.explain')}</p>
      {(['diapers', 'formula'] as const).map((source) => (
        <SupplyCard
          key={source}
          source={source}
          supply={data.supplies[source]}
          entries={data.entries}
          onShoppingList={data.onShoppingList[source]}
        />
      ))}
    </Page>
  );
}
