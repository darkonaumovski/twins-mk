import { useLive } from '@/data/StoreContext';
import type { Category, PrepItem } from '@/data/types';

export interface ChecklistData {
  categories: Category[];
  items: PrepItem[];
}

/** Live categories and items, sorted. Items whose category no longer exists move to the first category. */
export function useChecklistData(): ChecklistData | undefined {
  return useLive(async (s) => {
    const [categories, items] = await Promise.all([s.categories.list(), s.prepItems.list()]);
    categories.sort((a, b) => a.order - b.order);
    // A category can be deleted on one phone while the other adds an item to it; never hide such items.
    const rank = new Map(categories.map((c, i) => [c.id, i]));
    const fallback = categories[0]?.id;
    const placed = items.map((i) => (rank.has(i.categoryId) || !fallback ? i : { ...i, categoryId: fallback }));
    // Item order is per category, so sort by category first.
    placed.sort((a, b) => (rank.get(a.categoryId) ?? 0) - (rank.get(b.categoryId) ?? 0) || a.order - b.order);
    return { categories, items: placed };
  }, []);
}

export function nextItemOrder(items: readonly PrepItem[]): number {
  return Math.max(-1, ...items.map((i) => i.order)) + 1;
}
