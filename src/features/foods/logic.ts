import type { DataStore } from '@/data/repository';
import type { Food, FoodReaction, FoodTry, ISODate, NewRecord, TwinSlot } from '@/data/types';
import { BABY_IDS, babyIdsFor, slotOf, type Who } from '@/features/log/logic';

/**
 * Common first foods the parents can add in one tap. Names only (translated through `seedKey`):
 * no order, ages, amounts or allergen advice.
 */
export const EXAMPLE_FOODS = [
  'rice',
  'oats',
  'carrot',
  'potato',
  'sweetPotato',
  'pumpkin',
  'zucchini',
  'peas',
  'broccoli',
  'apple',
  'pear',
  'banana',
  'peach',
  'plum',
  'avocado',
  'yogurt',
  'egg',
  'chicken',
  'fish',
  'lentils',
] as const;
export type ExampleFood = (typeof EXAMPLE_FOODS)[number];

/**
 * Example foods carry a fixed, very old timestamp (like the starter checklist): both phones make identical
 * records, and any real edit or delete is newer and wins a merge.
 */
export const FOOD_SEED_TIME = '2000-01-03T00:00:00.000Z';

export const foodId = (key: ExampleFood) => `food-${key}`;

export function exampleFoodRecords(): Food[] {
  return EXAMPLE_FOODS.map((key, i) => ({
    id: foodId(key),
    createdAt: FOOD_SEED_TIME,
    updatedAt: FOOD_SEED_TIME,
    deletedAt: null,
    deviceId: 'seed',
    name: '',
    seedKey: `foods.examples.${key}`,
    order: i + 1,
  }));
}

/** "Add example foods": merged, so pressing it again (or on the other phone) changes nothing, and nothing renamed or deleted comes back. */
export async function addExampleFoods(store: Pick<DataStore, 'foods'>): Promise<void> {
  await store.foods.merge(exampleFoodRecords());
}

/** The order for a food added now: after every other. */
export function nextOrder(foods: readonly Food[]): number {
  return Math.max(100, ...foods.map((f) => f.order)) + 1;
}

/** Live foods in their order. */
export function sortedFoods(foods: readonly Food[]): Food[] {
  return foods.filter((f) => f.deletedAt === null).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

const newestFirst = (a: FoodTry, b: FoodTry) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

/** Each food's latest try per twin (what the grid shows): `foodId` → { A, B }. */
export function latestTries(tries: readonly FoodTry[]): Map<string, Partial<Record<TwinSlot, FoodTry>>> {
  const out = new Map<string, Partial<Record<TwinSlot, FoodTry>>>();
  for (const t of tries.filter((x) => x.deletedAt === null).sort(newestFirst)) {
    if (t.babyId !== BABY_IDS.A && t.babyId !== BABY_IDS.B) continue;
    const cells = out.get(t.foodId) ?? {};
    const slot = slotOf(t.babyId);
    if (!cells[slot]) cells[slot] = t;
    out.set(t.foodId, cells);
  }
  return out;
}

/** The tries of one food (for one twin, or both), newest first. */
export function triesOf(tries: readonly FoodTry[], food: string, slot?: TwinSlot): FoodTry[] {
  return tries.filter((t) => t.deletedAt === null && t.foodId === food && (!slot || t.babyId === BABY_IDS[slot])).sort(newestFirst);
}

export interface TryFields {
  foodId: string;
  date: ISODate;
  reaction: FoodReaction;
  note: string;
}

/** One try per twin; "both" links them with one `groupId`, like a tandem feed. */
export function tryRecords(who: Who, fields: TryFields, newGroupId: () => string): NewRecord<FoodTry>[] {
  const ids = babyIdsFor(who);
  const groupId = ids.length > 1 ? newGroupId() : null;
  return ids.map((babyId) => ({ ...fields, note: fields.note.trim(), babyId, groupId }));
}

/** Tries of these twins in [from, to] (calendar days, inclusive), oldest first: the doctor's report. */
export function triesInPeriod(tries: readonly FoodTry[], slots: readonly TwinSlot[], from: ISODate, to: ISODate): FoodTry[] {
  const ids = slots.map((s) => BABY_IDS[s]);
  return tries
    .filter((t) => t.deletedAt === null && ids.includes(t.babyId) && t.date >= from && t.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.babyId.localeCompare(b.babyId) || a.createdAt.localeCompare(b.createdAt));
}

/** For the keepsake book: the first day each twin tried each (live) food. */
export function firstTries(
  foods: readonly Food[],
  tries: readonly FoodTry[],
  label: (food: Food) => string,
): { name: string; dates: Partial<Record<TwinSlot, ISODate>> }[] {
  const live = new Map(sortedFoods(foods).map((f) => [f.id, f]));
  const firsts = new Map<string, Partial<Record<TwinSlot, ISODate>>>();
  for (const t of tries) {
    if (t.deletedAt !== null || !live.has(t.foodId) || (t.babyId !== BABY_IDS.A && t.babyId !== BABY_IDS.B)) continue;
    const dates = firsts.get(t.foodId) ?? {};
    const slot = slotOf(t.babyId);
    if (!dates[slot] || t.date < dates[slot]!) dates[slot] = t.date;
    firsts.set(t.foodId, dates);
  }
  return [...firsts].map(([id, dates]) => ({ name: label(live.get(id)!), dates }));
}
