import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { Button, IconButton } from '@/components/Button';
import { CommitInput, TextInput } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useStore } from '@/data/StoreContext';
import { useLabel } from '@/lib/labels';
import type { Category, PrepItem } from '@/data/types';

export function CategoryManager({ categories, items, onClose }: { categories: Category[]; items: PrepItem[]; onClose: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const label = useLabel();
  const toast = useToast();
  const [newName, setNewName] = useState('');

  const countIn = (id: string) => items.filter((i) => i.categoryId === id).length;

  const rename = (c: Category, name: string) => {
    if (name === label(c)) return;
    void store.categories.update(c.id, { name, seedKey: null });
  };

  /** Swap with the neighbour; orders are rewritten so they stay unique even after merges. */
  const move = async (index: number, delta: -1 | 1) => {
    const next = [...categories];
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved);
    await store.transaction(async () => {
      for (const [order, c] of next.entries()) if (c.order !== order) await store.categories.update(c.id, { order });
    });
  };

  const remove = async (c: Category) => {
    const name = label(c);
    if (countIn(c.id) > 0) {
      toast({ message: t('categories.notEmpty', { name }) });
      return;
    }
    await store.categories.remove(c.id);
    toast({
      message: t('categories.deleted', { name }),
      action: { label: t('common.undo'), onClick: () => void store.categories.restore(c.id) },
    });
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const order = Math.max(-1, ...categories.map((c) => c.order)) + 1;
    await store.categories.create({ name, seedKey: null, order });
    setNewName('');
  };

  return (
    <Sheet open onClose={onClose} title={t('categories.title')}>
      <ul className="divide-y divide-line">
        {categories.map((c, i) => (
          <li key={c.id} className="py-3 first:pt-0">
            <CommitInput
              value={label(c)}
              allowEmpty={false}
              onCommit={(name) => rename(c, name)}
              aria-label={t('categories.name')}
              maxLength={60}
            />
            <div className="mt-1 flex items-center">
              <p className="flex-1 px-1 text-sm text-muted">{t('categories.count', { count: countIn(c.id) })}</p>
              <IconButton
                label={t('categories.moveUp', { name: label(c) })}
                disabled={i === 0}
                onClick={() => move(i, -1)}
                className="disabled:opacity-30"
              >
                <ArrowUp aria-hidden size={20} />
              </IconButton>
              <IconButton
                label={t('categories.moveDown', { name: label(c) })}
                disabled={i === categories.length - 1}
                onClick={() => move(i, 1)}
                className="disabled:opacity-30"
              >
                <ArrowDown aria-hidden size={20} />
              </IconButton>
              <IconButton label={t('categories.delete', { name: label(c) })} onClick={() => remove(c)} className="text-danger">
                <Trash2 aria-hidden size={20} />
              </IconButton>
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-6 flex gap-2">
        <TextInput
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t('categories.newName')}
          aria-label={t('categories.newName')}
          maxLength={60}
        />
        <Button type="submit" aria-label={t('categories.add')} disabled={!newName.trim()}>
          <Plus aria-hidden size={20} />
        </Button>
      </form>
    </Sheet>
  );
}
