import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Check, PartyPopper, Store, Wallet } from 'lucide-react';
import { Page, Toggle } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useSettings, useStore } from '@/data/StoreContext';
import { useLabel } from '@/lib/labels';
import { formatMoney } from '@/lib/format';
import type { PrepItem } from '@/data/types';
import { completionPatch, neededTotal, remaining, withAcquired } from '@/features/checklist/logic';
import { ItemEditor } from '@/features/checklist/ItemEditor';
import { nextItemOrder, useChecklistData } from '@/features/checklist/useChecklistData';
import { shoppingGroups } from './logic';

const MUST_ONLY_KEY = 'twinsmk.shopping.mustOnly';

function readMustOnly(): boolean {
  try {
    return localStorage.getItem(MUST_ONLY_KEY) === '1';
  } catch {
    return false;
  }
}

export function ShoppingPage() {
  const { t, i18n } = useTranslation();
  const label = useLabel();
  const store = useStore();
  const toast = useToast();
  const settings = useSettings();
  const data = useChecklistData();
  const [mustOnly, setMustOnly] = useState(readMustOnly);
  const [editing, setEditing] = useState<PrepItem | null>(null);

  if (!data || !settings) return null;

  const money = (n: number) => formatMoney(n, settings.currency, i18n.language);
  const groups = shoppingGroups(data.items, { mustOnly });

  const changeMustOnly = (value: boolean) => {
    setMustOnly(value);
    try {
      localStorage.setItem(MUST_ONLY_KEY, value ? '1' : '0');
    } catch {
      /* per-phone convenience only */
    }
  };

  const undoable = (item: PrepItem, message: string) =>
    toast({
      message,
      action: {
        label: t('common.undo'),
        onClick: () => void store.prepItems.update(item.id, { acquired: item.acquired, status: item.status }),
      },
    });

  const buyAll = async (item: PrepItem) => {
    await store.prepItems.update(item.id, completionPatch(item, true));
    undoable(item, t('shopping.bought', { name: label(item) }));
  };

  const buyOne = async (item: PrepItem) => {
    const next = withAcquired(item, item.acquired + 1);
    await store.prepItems.update(item.id, { acquired: next.acquired, status: next.status });
    undoable(item, t('shopping.boughtOneToast', { name: label(item), acquired: next.acquired, total: neededTotal(item) }));
  };

  return (
    <Page
      title={t('shopping.title')}
      actions={
        <Link to="/budget" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 font-semibold text-accent">
          <Wallet aria-hidden size={18} />
          {t('nav.budget')}
        </Link>
      }
    >
      <div className="rounded-2xl border border-line bg-surface px-4">
        <Toggle label={t('shopping.mustOnly')} checked={mustOnly} onChange={changeMustOnly} />
      </div>

      {groups.length === 0 && (
        <p className="flex flex-col items-center gap-3 py-10 text-center text-muted">
          <PartyPopper aria-hidden size={32} className="text-accent" />
          {mustOnly ? t('shopping.allDoneMust') : t('shopping.allDone')}
        </p>
      )}

      {groups.map((group) => (
        <section key={group.store || '-'} className="overflow-hidden rounded-2xl border border-line bg-surface">
          <h2 className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-3">
            <Store aria-hidden size={18} className="shrink-0 text-muted" />
            <span className="flex-1 font-semibold">{group.store || t('shopping.noStore')}</span>
            <span className="text-sm text-muted">
              {t('shopping.items', { count: group.items.length })}
              {group.estimate > 0 && ` · ${t('shopping.about', { amount: money(group.estimate) })}`}
            </span>
          </h2>
          {!group.store && <p className="px-4 pt-2 text-sm text-muted">{t('shopping.storeHint')}</p>}
          <ul className="divide-y divide-line">
            {group.items.map((item) => {
              const left = remaining(item);
              const name = label(item);
              const meta = [t('shopping.toBuy', { count: left })];
              if (item.scope === 'perBaby') meta.push(t('shopping.perBaby', { qty: item.quantity }));
              if (item.status === 'ordered') meta.push(t('shopping.ordered'));
              if (item.priority === 'nice') meta.push(t('item.nice'));
              if (item.estimatedUnitPrice !== null) meta.push(t('shopping.about', { amount: money(item.estimatedUnitPrice * left) }));
              return (
                <li key={item.id} className="flex items-center gap-1 pr-2">
                  <button type="button" onClick={() => setEditing(item)} className="min-h-16 flex-1 py-2.5 pl-4 text-left">
                    <span className="block text-lg leading-snug">{name}</span>
                    <span className="block text-sm text-muted">{meta.join(' · ')}</span>
                  </button>
                  {left > 1 && (
                    <button
                      type="button"
                      onClick={() => buyOne(item)}
                      aria-label={t('shopping.boughtOne', { name })}
                      className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-2 font-semibold"
                    >
                      +1
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => buyAll(item)}
                    aria-label={t('shopping.markBought', { name })}
                    className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-ok text-ok hover:bg-ok hover:text-surface"
                  >
                    <Check aria-hidden size={22} strokeWidth={3} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

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
