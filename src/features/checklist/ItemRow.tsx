import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check } from 'lucide-react';
import { cx } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useStore } from '@/data/StoreContext';
import { formatShortDate } from '@/lib/format';
import type { ISODate, PrepItem } from '@/data/types';
import { completionPatch, isComplete, isOverdue, neededByDate, neededTotal } from './logic';

export function ItemRow({
  item,
  label,
  dueDate,
  today,
  onEdit,
}: {
  item: PrepItem;
  label: string;
  dueDate: ISODate | null;
  today: ISODate;
  onEdit: () => void;
}) {
  const { t, i18n } = useTranslation();
  const store = useStore();
  const toast = useToast();
  const complete = isComplete(item);
  const overdue = isOverdue(item, dueDate, today);
  const deadline = neededByDate(item.neededBy, dueDate);

  const toggle = async () => {
    const before = { acquired: item.acquired, status: item.status, done: item.done };
    await store.prepItems.update(item.id, completionPatch(item, !complete));
    // Un-ticking resets the quantity, so make it reversible.
    if (complete) {
      toast({
        message: t('checklist.unmarked', { name: label }),
        action: { label: t('common.undo'), onClick: () => void store.prepItems.update(item.id, before) },
      });
    }
  };

  const meta: string[] = [];
  if (item.kind === 'task') {
    meta.push(t('checklist.task'));
  } else {
    meta.push(
      item.scope === 'perBaby'
        ? t('checklist.qtyPerBaby', { acquired: item.acquired, total: neededTotal(item), qty: item.quantity })
        : t('checklist.qty', { acquired: item.acquired, total: neededTotal(item) }),
    );
    if (item.status !== 'needed') meta.push(t(`status.${item.status}`));
  }
  if (item.priority === 'nice') meta.push(t('item.nice'));
  if (deadline && !complete && !overdue) {
    meta.push(
      item.neededBy?.kind === 'week'
        ? t('checklist.byWeek', { week: item.neededBy.week })
        : t('checklist.byDate', { date: formatShortDate(deadline, i18n.language) }),
    );
  }

  return (
    <li className={cx('flex items-stretch', overdue && 'bg-danger/5')}>
      <label className="flex shrink-0 cursor-pointer items-center pr-1 pl-3">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={complete}
          onChange={toggle}
          aria-label={t('checklist.markDone', { name: label })}
        />
        <span
          aria-hidden
          className={cx(
            'flex size-8 items-center justify-center rounded-full border-2 transition peer-focus-visible:outline-3 peer-focus-visible:outline-accent',
            complete ? 'border-ok bg-ok text-surface' : 'border-muted/60',
          )}
        >
          {complete && <Check size={18} strokeWidth={3} />}
        </span>
      </label>
      <button type="button" onClick={onEdit} className="min-h-14 flex-1 py-2.5 pr-4 pl-2 text-left">
        <span className={cx('block', complete && 'text-muted line-through decoration-muted/60')}>{label}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
          {overdue && (
            <span className="inline-flex items-center gap-1 font-semibold text-danger">
              <AlertTriangle aria-hidden size={14} />
              {t('checklist.overdue')}
              {deadline && ` · ${formatShortDate(deadline, i18n.language)}`}
            </span>
          )}
          <span>{meta.join(' · ')}</span>
        </span>
      </button>
    </li>
  );
}
