import { describe, expect, it } from 'vitest';
import { openDexieStore } from '@/data/dexieStore';
import { exportBackup, importBackup, parseBackup } from '@/data/backup';
import type { FoodTry } from '@/data/types';
import {
  addExampleFoods,
  EXAMPLE_FOODS,
  firstTries,
  latestTries,
  nextOrder,
  sortedFoods,
  triesInPeriod,
  triesOf,
  tryRecords,
} from './logic';

let n = 0;
const meta = { createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '', deletedAt: null, deviceId: 'd' };
const tryOf = (id: string, babyId: string, date: string, reaction: FoodTry['reaction'], over: Partial<FoodTry> = {}): FoodTry => ({
  ...meta,
  id,
  foodId: 'food-carrot',
  babyId,
  date,
  reaction,
  note: '',
  groupId: null,
  ...over,
});

describe('example foods', () => {
  it('are added once, with the same ids on both phones, and never twice after merging', async () => {
    const phone1 = await openDexieStore({ name: `foods-${++n}` });
    const phone2 = await openDexieStore({ name: `foods-${++n}` });
    await addExampleFoods(phone1);
    await addExampleFoods(phone1);
    await addExampleFoods(phone2);
    expect(await phone1.foods.list()).toHaveLength(EXAMPLE_FOODS.length);
    await importBackup(phone2, parseBackup(JSON.stringify(await exportBackup(phone1))));
    await importBackup(phone1, parseBackup(JSON.stringify(await exportBackup(phone2))));
    expect((await phone2.foods.list()).map((f) => f.id).sort()).toEqual((await phone1.foods.list()).map((f) => f.id).sort());
    expect(await phone2.foods.list()).toHaveLength(EXAMPLE_FOODS.length);
  });

  it('keep a rename or a delete when added again on either phone', async () => {
    const phone1 = await openDexieStore({ name: `foods-${++n}` });
    const phone2 = await openDexieStore({ name: `foods-${++n}` });
    await addExampleFoods(phone1);
    await phone1.foods.update('food-carrot', { name: 'Морков (од градина)', seedKey: null });
    await phone1.foods.remove('food-fish');
    await addExampleFoods(phone1);
    await addExampleFoods(phone2);
    await importBackup(phone2, parseBackup(JSON.stringify(await exportBackup(phone1))));
    expect((await phone2.foods.get('food-carrot'))?.name).toBe('Морков (од градина)');
    expect(await phone2.foods.get('food-fish')).toBeUndefined();
  });

  it('come before the parents’ own foods, which go at the end', async () => {
    const store = await openDexieStore({ name: `foods-${++n}` });
    await addExampleFoods(store);
    await store.foods.create({ name: 'Ajvar', seedKey: null, order: nextOrder(await store.foods.list()) });
    const sorted = sortedFoods(await store.foods.list());
    expect(sorted[0].id).toBe('food-rice');
    expect(sorted.at(-1)?.name).toBe('Ajvar');
  });
});

describe('the grid', () => {
  it('shows each twin’s latest reaction per food, ignoring deleted tries', () => {
    const latest = latestTries([
      tryOf('1', 'baby-A', '2026-12-01', 'refused'),
      tryOf('2', 'baby-A', '2026-12-05', 'liked'),
      tryOf('3', 'baby-B', '2026-12-03', 'neutral'),
      tryOf('4', 'baby-B', '2026-12-06', 'refused', { deletedAt: 'x' }),
      tryOf('5', 'baby-A', '2026-12-02', 'liked', { foodId: 'food-pear' }),
    ]);
    expect(latest.get('food-carrot')?.A?.reaction).toBe('liked');
    expect(latest.get('food-carrot')?.B?.reaction).toBe('neutral');
    expect(latest.get('food-pear')?.B).toBeUndefined();
    expect(latest.get('food-rice')).toBeUndefined();
  });

  it('on the same day, the try entered last counts', () => {
    const latest = latestTries([
      tryOf('a', 'baby-A', '2026-12-01', 'refused', { createdAt: '2026-12-01T08:00:00.000Z' }),
      tryOf('b', 'baby-A', '2026-12-01', 'liked', { createdAt: '2026-12-01T18:00:00.000Z' }),
    ]);
    expect(latest.get('food-carrot')?.A?.id).toBe('b');
  });

  it('lists a food’s tries for one twin, newest first', () => {
    const tries = [
      tryOf('1', 'baby-A', '2026-12-01', 'refused'),
      tryOf('2', 'baby-A', '2026-12-05', 'liked'),
      tryOf('3', 'baby-B', '2026-12-03', 'neutral'),
    ];
    expect(triesOf(tries, 'food-carrot', 'A').map((t) => t.id)).toEqual(['2', '1']);
    expect(triesOf(tries, 'food-carrot').map((t) => t.id)).toEqual(['2', '3', '1']);
  });
});

describe('logging a try', () => {
  it('links the two tries of "both twins" and keeps one twin’s try alone', () => {
    const both = tryRecords('both', { foodId: 'food-pear', date: '2026-12-01', reaction: 'liked', note: ' first spoon ' }, () => 'g');
    expect(both.map((t) => [t.babyId, t.groupId, t.note])).toEqual([
      ['baby-A', 'g', 'first spoon'],
      ['baby-B', 'g', 'first spoon'],
    ]);
    expect(tryRecords('B', { foodId: 'food-pear', date: '2026-12-01', reaction: 'refused', note: '' }, () => 'g')[0].groupId).toBeNull();
  });

  it('lets each twin’s reaction be changed on its own', async () => {
    const store = await openDexieStore({ name: `foods-${++n}` });
    const [a, b] = await store.foodTries.createMany(
      tryRecords('both', { foodId: 'food-pear', date: '2026-12-01', reaction: 'liked', note: '' }, () => 'g'),
    );
    await store.foodTries.update(b.id, { reaction: 'refused' });
    expect((await store.foodTries.get(a.id))?.reaction).toBe('liked');
  });
});

describe('the report and the book', () => {
  const tries = [
    tryOf('before', 'baby-A', '2026-11-30', 'liked'),
    tryOf('first', 'baby-A', '2026-12-01', 'liked'),
    tryOf('b', 'baby-B', '2026-12-04', 'neutral'),
    tryOf('last', 'baby-A', '2026-12-07', 'refused', { foodId: 'food-pear' }),
    tryOf('after', 'baby-A', '2026-12-08', 'liked'),
  ];

  it('lists the tries of the period (both ends included) for the chosen twins', () => {
    expect(triesInPeriod(tries, ['A', 'B'], '2026-12-01', '2026-12-07').map((t) => t.id)).toEqual(['first', 'b', 'last']);
    expect(triesInPeriod(tries, ['B'], '2026-12-01', '2026-12-31').map((t) => t.id)).toEqual(['b']);
  });

  it('gives the first day each twin tried each food, for live foods only', () => {
    const foods = [
      { ...meta, id: 'food-carrot', name: '', seedKey: 'foods.examples.carrot', order: 3 },
      { ...meta, id: 'food-pear', name: '', seedKey: null, order: 4, deletedAt: 'x' },
    ];
    expect(firstTries(foods, tries, () => 'Carrot')).toEqual([{ name: 'Carrot', dates: { A: '2026-11-30', B: '2026-12-04' } }]);
  });
});

describe('first foods between phones', () => {
  it('round-trips tries through a backup, including a deleted one and the link of both twins', async () => {
    const phone1 = await openDexieStore({ name: `foods-${++n}` });
    const phone2 = await openDexieStore({ name: `foods-${++n}` });
    const [a, b] = await phone1.foodTries.createMany(
      tryRecords('both', { foodId: 'food-pear', date: '2026-12-01', reaction: 'liked', note: '' }, () => 'g'),
    );
    await phone1.foodTries.remove(b.id);
    await importBackup(phone2, parseBackup(JSON.stringify(await exportBackup(phone1))));
    expect(await phone2.foodTries.list()).toEqual([a]);
    expect((await phone2.foodTries.listAll()).find((x) => x.id === b.id)?.deletedAt).not.toBeNull();
  });

  it('announces tries and the parents’ own foods, but never the example foods', async () => {
    const { createInstance } = await import('i18next');
    const en = (await import('@/i18n/locales/en')).default;
    const { changeLine, fromOtherPhone } = await import('@/features/sync/changes');
    const i18n = createInstance();
    await i18n.init({ resources: { en: { translation: en } }, lng: 'en', interpolation: { escapeValue: false } });
    const t = (key: string, o?: Record<string, unknown>) => (i18n.t as unknown as (k: string, o?: object) => string)(key, o);
    const h = {
      t,
      entry: () => ({ title: '', detail: '' }),
      twin: (id: string) => (id === 'baby-A' ? 'Ema' : 'Ana'),
      label: (r: { name: string; seedKey: string | null }) => (r.seedKey ? t(r.seedKey) : r.name),
      routineTitle: () => undefined,
      foodName: (id: string) => (id === 'food-pear' ? 'Pear' : undefined),
      when: () => '',
      day: () => '',
      parentName: () => '',
      caregiverIds: ['p1', 'p2'],
    };
    const tr = tryOf('t', 'baby-B', '2026-12-01', 'refused', { foodId: 'food-pear', deviceId: 'other' });
    expect(changeLine({ collection: 'foodTries', record: tr, previous: undefined }, h)).toBe('Pear · Ana · Refused');
    expect(changeLine({ collection: 'foodTries', record: { ...tr, foodId: 'gone' } as FoodTry, previous: undefined }, h)).toBe(
      'a food · Ana · Refused',
    );
    const own = { ...meta, id: 'f1', deviceId: 'other', name: 'Ajvar', seedKey: null, order: 101 };
    expect(changeLine({ collection: 'foods', record: own, previous: undefined }, h)).toBe('Food added: Ajvar');
    const seeded = { ...meta, id: 'food-pear', deviceId: 'seed', name: '', seedKey: 'foods.examples.pear', order: 11 };
    expect(fromOtherPhone([{ collection: 'foods', record: seeded, previous: undefined }], 'mine')).toEqual([]);
  });
});
