import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/Toast';
import { useLive, useStore } from '@/data/StoreContext';
import { remaining } from '@/features/checklist/logic';
import { formatNumber } from '@/lib/format';
import type { LogEntry, PrepItem, Supply, SupplySource } from '@/data/types';
import { restockPatch, SUPPLY_CHECKLIST_ITEMS, supplyEntriesSince, type SupplyStatus } from './logic';

export interface SupplyData {
  supplies: Partial<Record<SupplySource, Supply>>;
  /** Log entries since the oldest count (and the usage window). */
  entries: LogEntry[];
  /** Whether each supply's checklist item is on the shopping list right now. */
  onShoppingList: Record<SupplySource, boolean>;
}

const SOURCES: readonly SupplySource[] = ['diapers', 'formula'];

/** The parents' supplies with the log entries their counts depend on, kept live. */
export function useSupplyData(): SupplyData | undefined {
  return useLive(async (s) => {
    const list = await s.supplies.list();
    const supplies: SupplyData['supplies'] = {};
    for (const supply of list) supplies[supply.source] = supply;
    const now = new Date();
    const entries = list.length
      ? await s.logs.listBetween(supplyEntriesSince(list, now), new Date(now.getTime() + 60_000).toISOString())
      : [];
    const onShoppingList = { diapers: false, formula: false };
    for (const source of SOURCES) {
      const item = await s.prepItems.get(SUPPLY_CHECKLIST_ITEMS[source]);
      onShoppingList[source] = Boolean(item && item.status === 'needed' && remaining(item) > 0);
    }
    return { supplies, entries, onShoppingList };
  }, []);
}

/** "+ pack" and "Add to shopping list", each with an undo toast. */
export function useSupplyActions() {
  const { t } = useTranslation();
  const store = useStore();
  const toast = useToast();

  const restock = useCallback(
    async (supply: Supply, entries: readonly LogEntry[]) => {
      const before = { stock: supply.stock, countedAt: supply.countedAt };
      await store.supplies.update(supply.id, restockPatch(supply, entries, new Date()));
      toast({
        message: t('supplies.restocked', { name: t(`supplies.${supply.source}`) }),
        action: { label: t('common.undo'), onClick: () => void store.supplies.update(supply.id, before) },
      });
    },
    [store, toast, t],
  );

  /** Puts the matching checklist item back on the shopping list (status "needed"). */
  const addToShopping = useCallback(
    async (source: SupplySource) => {
      const id = SUPPLY_CHECKLIST_ITEMS[source];
      const existing = (await store.prepItems.listAll()).find((i) => i.id === id);
      await store.transaction(async () => {
        if (existing) {
          if (existing.deletedAt) await store.prepItems.restore(id);
          await store.prepItems.update(id, { status: 'needed', acquired: 0, done: false });
        } else {
          const item: Omit<PrepItem, 'createdAt' | 'updatedAt' | 'deletedAt' | 'deviceId'> = {
            id,
            kind: 'item',
            name: t(`seed.item.${source}`),
            seedKey: `seed.item.${source}`,
            categoryId: source === 'diapers' ? 'seed-cat-diapering' : 'seed-cat-feeding',
            scope: 'shared',
            quantity: 1,
            acquired: 0,
            priority: 'must',
            status: 'needed',
            estimatedUnitPrice: null,
            actualPrice: null,
            store: '',
            link: '',
            notes: '',
            neededBy: null,
            done: false,
            order: 999,
          };
          await store.prepItems.create(item);
        }
      });
      toast({ message: t('supplies.addedToShopping', { name: t(`supplies.${source}`) }) });
    },
    [store, toast, t],
  );

  return { restock, addToShopping };
}

/** "≈ 230 diapers" or "≈ 2.5 tins (1800 ml)". */
export function useSupplyAmount() {
  const { t, i18n } = useTranslation();
  return (supply: Supply, amount: number) => {
    if (supply.source === 'diapers') return t('supplies.diapersLeft', { count: Math.round(amount) });
    const tins = supply.packSize > 0 ? amount / supply.packSize : 0;
    return t('supplies.tinsLeft', {
      tins: formatNumber(tins, i18n.language),
      ml: Math.round(amount),
    });
  };
}

/** "≈ 3 days left", "less than a day left" or "no use logged in the last 3 days". */
export function useDaysLeftText() {
  const { t } = useTranslation();
  return (status: SupplyStatus) => {
    if (status.daysLeft === null) return t('supplies.noRecentUse');
    if (status.daysLeft < 1) return t('supplies.lessThanDay');
    return t('supplies.daysLeft', { count: Math.floor(status.daysLeft) });
  };
}
