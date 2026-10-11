import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { Stepper } from '@/components/Stepper';
import { Field, Segmented, Select, TextArea, TextInput, Toggle } from '@/components/ui';
import { useConfirm } from '@/components/Confirm';
import { useToast } from '@/components/Toast';
import { useStore } from '@/data/StoreContext';
import { useLabel } from '@/lib/labels';
import { dateOfWeek } from '@/lib/pregnancy';
import { formatAmountInput, formatLongDate, safeUrl, todayISO } from '@/lib/format';
import type { Category, ISODate, NeededBy, NewRecord, PrepItem, PrepStatus, Priority, Scope } from '@/data/types';
import { neededTotal, parseAmount, withAcquired, withStatus } from './logic';

const STATUSES: PrepStatus[] = ['needed', 'ordered', 'bought', 'gifted', 'borrowed'];

interface Draft {
  kind: PrepItem['kind'];
  name: string;
  categoryId: string;
  scope: Scope;
  quantity: number;
  acquired: number;
  priority: Priority;
  status: PrepStatus;
  done: boolean;
  estimatedUnitPrice: string;
  actualPrice: string;
  store: string;
  link: string;
  notes: string;
  deadline: 'none' | 'week' | 'date';
  week: number;
  date: ISODate;
}

function toDraft(item: PrepItem | null, label: string, categoryId: string, language: string): Draft {
  return {
    kind: item?.kind ?? 'item',
    name: item ? label : '',
    categoryId: item?.categoryId ?? categoryId,
    scope: item?.scope ?? 'shared',
    quantity: item?.quantity ?? 1,
    acquired: item?.acquired ?? 0,
    priority: item?.priority ?? 'must',
    status: item?.status ?? 'needed',
    done: item?.done ?? false,
    estimatedUnitPrice: formatAmountInput(item?.estimatedUnitPrice ?? null, language),
    actualPrice: formatAmountInput(item?.actualPrice ?? null, language),
    store: item?.store ?? '',
    link: item?.link ?? '',
    notes: item?.notes ?? '',
    deadline: item?.neededBy?.kind ?? 'none',
    week: item?.neededBy?.kind === 'week' ? item.neededBy.week : 34,
    date: item?.neededBy?.kind === 'date' ? item.neededBy.date : todayISO(),
  };
}

export function ItemEditor({
  item,
  categories,
  defaultCategoryId,
  dueDate,
  nextOrder,
  onClose,
}: {
  /** `null` creates a new item. */
  item: PrepItem | null;
  categories: Category[];
  defaultCategoryId: string;
  dueDate: ISODate | null;
  nextOrder: number;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const store = useStore();
  const label = useLabel();
  const confirm = useConfirm();
  const toast = useToast();
  const originalLabel = item ? label(item) : '';
  const [draft, setDraft] = useState<Draft>(() => toDraft(item, originalLabel, defaultCategoryId, i18n.language));
  const [nameError, setNameError] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const isTask = draft.kind === 'task';
  const total = neededTotal(draft);
  const hasDetails = Boolean(draft.estimatedUnitPrice || draft.actualPrice || draft.store || draft.link || draft.notes);
  const link = safeUrl(draft.link);

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    const name = draft.name.trim();
    if (!name) {
      setNameError(true);
      return;
    }
    const neededBy: NeededBy =
      draft.deadline === 'week'
        ? { kind: 'week', week: draft.week }
        : draft.deadline === 'date'
          ? { kind: 'date', date: draft.date }
          : null;
    // Keep following the translation unless the user actually renamed a seeded item.
    const keepSeed = item?.seedKey && name === originalLabel ? item : null;
    const record: NewRecord<PrepItem> = {
      kind: draft.kind,
      name: keepSeed ? keepSeed.name : name,
      seedKey: keepSeed ? keepSeed.seedKey : null,
      categoryId: draft.categoryId,
      scope: isTask ? 'shared' : draft.scope,
      quantity: isTask ? 1 : draft.quantity,
      acquired: isTask ? 0 : draft.acquired,
      priority: draft.priority,
      status: isTask ? 'needed' : draft.status,
      done: isTask ? draft.done : false,
      estimatedUnitPrice: parseAmount(draft.estimatedUnitPrice),
      actualPrice: parseAmount(draft.actualPrice),
      store: draft.store.trim(),
      link: draft.link.trim(),
      notes: draft.notes.trim(),
      neededBy,
      order: item?.order ?? nextOrder,
    };
    if (item) await store.prepItems.update(item.id, record);
    else await store.prepItems.create(record);
    onClose();
  };

  const remove = async () => {
    if (!item) return;
    const ok = await confirm({
      title: t('item.deleteConfirm', { name: originalLabel }),
      body: t('item.deleteBody'),
      confirmLabel: t('item.delete'),
      danger: true,
    });
    if (!ok) return;
    await store.prepItems.remove(item.id);
    onClose();
    toast({
      message: t('item.deleted', { name: originalLabel }),
      action: { label: t('common.undo'), onClick: () => void store.prepItems.restore(item.id) },
    });
  };

  const title = !item ? t('item.newItem') : item.kind === 'task' ? t('item.editTask') : t('item.editItem');

  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          {item && (
            <Button variant="ghost" onClick={remove} className="text-danger" aria-label={t('item.delete')}>
              <Trash2 aria-hidden size={20} />
            </Button>
          )}
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="item-form" className="flex-1">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="item-form" onSubmit={save} className="space-y-5">
        {!item && (
          <Segmented<PrepItem['kind']>
            label={t('item.kind')}
            value={draft.kind}
            options={[
              { value: 'item', label: t('item.kindItem') },
              { value: 'task', label: t('item.kindTask') },
            ]}
            onChange={(kind) => set('kind', kind)}
          />
        )}

        <Field label={t('item.name')} hint={nameError ? <span className="text-danger">{t('item.nameRequired')}</span> : undefined}>
          {(props) => (
            <TextInput
              {...props}
              value={draft.name}
              onChange={(e) => {
                set('name', e.target.value);
                setNameError(false);
              }}
              aria-invalid={nameError}
              data-autofocus={!item || undefined}
              maxLength={120}
            />
          )}
        </Field>

        <Field label={t('item.category')}>
          {(props) => (
            <Select {...props} value={draft.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {label(c)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {isTask ? (
          <Toggle label={t('item.taskDone')} checked={draft.done} onChange={(v) => set('done', v)} />
        ) : (
          <>
            <Segmented<Scope>
              label={t('item.scope')}
              value={draft.scope}
              options={[
                { value: 'perBaby', label: t('item.perBaby') },
                { value: 'shared', label: t('item.shared') },
              ]}
              onChange={(scope) => setDraft((d) => withAcquired({ ...d, scope }, d.acquired))}
            />
            <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2">
              <Stepper
                label={draft.scope === 'perBaby' ? t('item.quantityPerBaby') : t('item.quantity')}
                value={draft.quantity}
                min={1}
                onChange={(quantity) => setDraft((d) => withAcquired({ ...d, quantity }, d.acquired))}
                hint={draft.scope === 'perBaby' ? t('item.totalNeeded', { total }) : undefined}
              />
              <Stepper label={t('item.acquired')} value={draft.acquired} onChange={(n) => setDraft((d) => withAcquired(d, n))} />
            </div>
            <Field label={t('item.status')}>
              {(props) => (
                <Select {...props} value={draft.status} onChange={(e) => setDraft((d) => withStatus(d, e.target.value as PrepStatus))}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`status.${s}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </>
        )}

        <Segmented<Priority>
          label={t('item.priority')}
          value={draft.priority}
          options={[
            { value: 'must', label: t('item.must') },
            { value: 'nice', label: t('item.nice') },
          ]}
          onChange={(priority) => set('priority', priority)}
        />

        <Segmented<Draft['deadline']>
          label={t('item.neededBy')}
          value={draft.deadline}
          options={[
            { value: 'none', label: t('item.noDeadline') },
            { value: 'week', label: t('item.byWeek') },
            { value: 'date', label: t('item.byDate') },
          ]}
          onChange={(deadline) => set('deadline', deadline)}
        />
        {draft.deadline === 'week' && (
          <Stepper
            label={t('item.week')}
            value={draft.week}
            min={1}
            max={42}
            onChange={(week) => set('week', week)}
            hint={
              dueDate
                ? t('item.weekDate', { week: draft.week, date: formatLongDate(dateOfWeek(dueDate, draft.week), i18n.language) })
                : t('item.weekNoDueDate')
            }
          />
        )}
        {draft.deadline === 'date' && (
          <Field label={t('item.byDate')}>
            {(props) => (
              <TextInput {...props} type="date" value={draft.date} onChange={(e) => e.target.value && set('date', e.target.value)} />
            )}
          </Field>
        )}

        <details open={hasDetails} className="group rounded-2xl border border-line">
          <summary className="flex min-h-12 cursor-pointer items-center px-4 font-medium">{t('item.more')}</summary>
          <div className="space-y-4 border-t border-line p-4">
            {!isTask && (
              <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2">
                <Field label={t('item.estimatedUnitPrice')}>
                  {(props) => (
                    <TextInput
                      {...props}
                      inputMode="decimal"
                      value={draft.estimatedUnitPrice}
                      onChange={(e) => set('estimatedUnitPrice', e.target.value)}
                    />
                  )}
                </Field>
                <Field label={t('item.actualPrice')}>
                  {(props) => (
                    <TextInput
                      {...props}
                      inputMode="decimal"
                      value={draft.actualPrice}
                      onChange={(e) => set('actualPrice', e.target.value)}
                    />
                  )}
                </Field>
              </div>
            )}
            <Field label={t('item.store')}>
              {(props) => <TextInput {...props} value={draft.store} onChange={(e) => set('store', e.target.value)} maxLength={80} />}
            </Field>
            <Field
              label={t('item.link')}
              hint={
                link ? (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1 font-medium text-accent underline"
                  >
                    <ExternalLink aria-hidden size={16} />
                    {t('item.openLink')}
                  </a>
                ) : undefined
              }
            >
              {(props) => (
                <TextInput
                  {...props}
                  inputMode="url"
                  autoCapitalize="off"
                  value={draft.link}
                  onChange={(e) => set('link', e.target.value)}
                />
              )}
            </Field>
            <Field label={t('item.notes')}>
              {(props) => <TextArea {...props} value={draft.notes} onChange={(e) => set('notes', e.target.value)} maxLength={1000} />}
            </Field>
          </div>
        </details>
      </form>
    </Sheet>
  );
}
