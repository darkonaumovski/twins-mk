import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, FolderCog, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { Button, IconButton } from '@/components/Button';
import { ProgressBar } from '@/components/ProgressBar';
import { Page, Select, TextInput, Toggle, cx } from '@/components/ui';
import { useSettings } from '@/data/StoreContext';
import { useLabel } from '@/lib/labels';
import { todayISO } from '@/lib/format';
import type { PrepItem, PrepStatus, Priority } from '@/data/types';
import { activeFilterCount, isOverdue, matchesFilters, NO_FILTERS, progress, type ChecklistFilters, type StatusFilter } from './logic';
import { ItemRow } from './ItemRow';
import { ItemEditor } from './ItemEditor';
import { CategoryManager } from './CategoryManager';
import { Countdown } from './Countdown';
import { nextItemOrder, useChecklistData } from './useChecklistData';

const STATUS_FILTERS: StatusFilter[] = ['all', 'open', 'done', 'needed', 'ordered', 'bought', 'gifted', 'borrowed'];
const COLLAPSED_KEY = 'twinsmk.checklist.collapsed';

function readFilters(params: URLSearchParams): ChecklistFilters {
  return {
    q: params.get('q') ?? '',
    category: params.get('cat') ?? 'all',
    status: (params.get('status') as StatusFilter) ?? 'all',
    priority: (params.get('prio') as Priority) ?? 'all',
    overdueOnly: params.get('overdue') === '1',
  };
}

function writeFilters(f: ChecklistFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.category !== 'all') p.set('cat', f.category);
  if (f.status !== 'all') p.set('status', f.status);
  if (f.priority !== 'all') p.set('prio', f.priority);
  if (f.overdueOnly) p.set('overdue', '1');
  return p;
}

/** Collapsed categories are a per-phone convenience, so they live in localStorage. */
function useCollapsed() {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        /* not critical */
      }
      return next;
    });
  return [collapsed, toggle] as const;
}

export function ChecklistPage() {
  const { t } = useTranslation();
  const label = useLabel();
  const settings = useSettings();
  const data = useChecklistData();

  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const setFilters = (patch: Partial<ChecklistFilters>) => setParams(writeFilters({ ...filters, ...patch }), { replace: true });
  const filterCount = activeFilterCount(filters);
  const [showFilters, setShowFilters] = useState(filterCount > 0);
  const [collapsed, toggleCollapsed] = useCollapsed();
  const [editing, setEditing] = useState<PrepItem | 'new' | null>(null);
  const [managing, setManaging] = useState(false);

  const today = todayISO();
  const dueDate = settings?.dueDate ?? null;

  const view = (() => {
    if (!data) return null;
    const ctx = { label, dueDate, today };
    const filtering = filterCount > 0 || filters.q.trim() !== '';
    const { items } = data;
    const groups = data.categories
      .map((c) => {
        const all = items.filter((i) => i.categoryId === c.id);
        return { category: c, all, shown: all.filter((i) => matchesFilters(i, filters, ctx)) };
      })
      .filter((g) => !filtering || g.shown.length > 0);
    return {
      groups,
      filtering,
      overall: progress(items),
      overdueCount: items.filter((i) => isOverdue(i, dueDate, today)).length,
      nextOrder: nextItemOrder(items),
      items,
    };
  })();

  if (!data || !settings || !view) return null;

  const defaultCategoryId = filters.category !== 'all' ? filters.category : (data.categories[0]?.id ?? '');

  return (
    <Page
      title={t('checklist.title')}
      actions={
        <IconButton label={t('checklist.manageCategories')} onClick={() => setManaging(true)}>
          <FolderCog aria-hidden size={22} />
        </IconButton>
      }
    >
      <Countdown
        dueDate={dueDate}
        overall={view.overall}
        overdueCount={view.overdueCount}
        overdueActive={filters.overdueOnly}
        onToggleOverdue={() => setFilters({ overdueOnly: !filters.overdueOnly })}
        showArrived={settings.phase === 'prep'}
      />

      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search aria-hidden size={20} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <TextInput
              type="search"
              value={filters.q}
              onChange={(e) => setFilters({ q: e.target.value })}
              placeholder={t('checklist.search')}
              aria-label={t('checklist.search')}
              className="pl-10"
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-controls="checklist-filters"
            aria-label={t('checklist.filters')}
            className="relative"
          >
            <SlidersHorizontal aria-hidden size={20} />
            {filterCount > 0 && (
              <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-accent text-xs text-on-accent">
                {filterCount}
              </span>
            )}
          </Button>
        </div>

        {showFilters && (
          <div id="checklist-filters" className="space-y-3 rounded-2xl border border-line bg-surface p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select
                aria-label={t('checklist.category')}
                value={filters.category}
                onChange={(e) => setFilters({ category: e.target.value })}
              >
                <option value="all">{t('checklist.allCategories')}</option>
                {data.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {label(c)}
                  </option>
                ))}
              </Select>
              <Select
                aria-label={t('checklist.status')}
                value={filters.status}
                onChange={(e) => setFilters({ status: e.target.value as StatusFilter })}
              >
                {STATUS_FILTERS.map((s) => (
                  <option key={s} value={s}>
                    {s === 'all'
                      ? t('checklist.anyStatus')
                      : s === 'open'
                        ? t('checklist.open')
                        : s === 'done'
                          ? t('checklist.done')
                          : t(`status.${s as PrepStatus}`)}
                  </option>
                ))}
              </Select>
              <Select
                aria-label={t('checklist.priority')}
                value={filters.priority}
                onChange={(e) => setFilters({ priority: e.target.value as Priority | 'all' })}
              >
                <option value="all">{t('checklist.anyPriority')}</option>
                <option value="must">{t('item.must')}</option>
                <option value="nice">{t('item.nice')}</option>
              </Select>
            </div>
            <Toggle
              label={t('checklist.overdueOnly')}
              checked={filters.overdueOnly}
              onChange={(overdueOnly) => setFilters({ overdueOnly })}
            />
            {filterCount > 0 && (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setParams(writeFilters({ ...NO_FILTERS, q: filters.q }), { replace: true })}
              >
                {t('checklist.clearFilters')}
              </Button>
            )}
          </div>
        )}
      </div>

      {view.groups.length === 0 && <p className="py-8 text-center text-muted">{t('checklist.noResults')}</p>}

      <div className="space-y-4">
        {view.groups.map(({ category, all, shown }) => {
          const name = label(category);
          const p = progress(all);
          const open = view.filtering || !collapsed.has(category.id);
          return (
            <section key={category.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
              <h2>
                <button
                  type="button"
                  onClick={() => toggleCollapsed(category.id)}
                  aria-expanded={open}
                  disabled={view.filtering}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{name}</span>
                      <span className="text-sm text-muted tabular-nums">
                        {p.done}/{p.total}
                      </span>
                    </span>
                    <ProgressBar value={p.done} max={p.total} label={t('checklist.categoryProgress', { name, ...p })} className="mt-2" />
                  </span>
                  {!view.filtering && (
                    <ChevronDown aria-hidden size={20} className={cx('shrink-0 text-muted transition', open && 'rotate-180')} />
                  )}
                </button>
              </h2>
              {open &&
                (shown.length === 0 ? (
                  <p className="border-t border-line px-4 py-3 text-sm text-muted">{t('checklist.empty')}</p>
                ) : (
                  <ul className="divide-y divide-line border-t border-line">
                    {shown.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        label={label(item)}
                        dueDate={dueDate}
                        today={today}
                        onEdit={() => setEditing(item)}
                      />
                    ))}
                  </ul>
                ))}
            </section>
          );
        })}
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-10 mx-auto flex max-w-2xl justify-end px-4">
        <button
          type="button"
          onClick={() => setEditing('new')}
          aria-label={t('checklist.add')}
          title={t('checklist.add')}
          className="pointer-events-auto flex size-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-lg hover:brightness-110"
        >
          <Plus aria-hidden size={28} />
        </button>
      </div>
      {/* Space so the last row can scroll above the floating button. */}
      <div aria-hidden className="h-16" />

      {editing && (
        <ItemEditor
          item={editing === 'new' ? null : editing}
          categories={data.categories}
          defaultCategoryId={defaultCategoryId}
          dueDate={dueDate}
          nextOrder={view.nextOrder}
          onClose={() => setEditing(null)}
        />
      )}
      {managing && <CategoryManager categories={data.categories} items={view.items} onClose={() => setManaging(false)} />}
    </Page>
  );
}
