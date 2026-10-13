import { useLive } from '@/data/StoreContext';
import type { ISODate, TwinSlot } from '@/data/types';
import { useLabel } from '@/lib/labels';
import { firstTries } from '@/features/foods/logic';

/** The first day each twin tried each food, for the keepsake book (none while first foods are off). */
export function useFirstFoods(): { name: string; dates: Partial<Record<TwinSlot, ISODate>> }[] | undefined {
  const label = useLabel();
  const data = useLive(
    async (s) => ({ on: (await s.settings.get()).solidsEnabled, foods: await s.foods.listAll(), tries: await s.foodTries.list() }),
    [],
  );
  if (!data) return undefined;
  return data.on ? firstTries(data.foods, data.tries, label) : [];
}
