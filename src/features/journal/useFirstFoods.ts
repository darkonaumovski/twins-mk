import type { ISODate, TwinSlot } from '@/data/types';

/** The first day each twin tried each food, for the keepsake book. Filled in by the first-foods feature (F14). */
export function useFirstFoods(): { name: string; dates: Partial<Record<TwinSlot, ISODate>> }[] | undefined {
  return [];
}
