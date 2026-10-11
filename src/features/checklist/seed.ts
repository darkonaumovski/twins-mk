import seedEn from '@/i18n/locales/seed.en';
import type { DataStore } from '@/data/repository';
import type { Category, PrepItem, Priority, Scope } from '@/data/types';

/**
 * The starter checklist. Quantities, priorities and "needed by" weeks are
 * editable suggestions, not recommendations. Prices are left empty on purpose.
 *
 * Seed records use fixed ids and a fixed, very old timestamp. That makes
 * seeding idempotent and merge-safe: both phones seed the same records, and
 * any real edit (or delete) on either phone is newer and wins a merge.
 */
export const SEED_VERSION = 1;
const SEED_TIME = '2000-01-01T00:00:00.000Z';
const SEED_DEVICE = 'seed';

type CatKey = keyof typeof seedEn.cat;
type ItemKey = keyof typeof seedEn.item;

interface SeedItem {
  key: ItemKey;
  scope: Scope;
  qty: number;
  priority: Priority;
  week?: number;
  task?: boolean;
}

const per = (key: ItemKey, qty: number, priority: Priority, week?: number): SeedItem => ({ key, scope: 'perBaby', qty, priority, week });
const shared = (key: ItemKey, qty: number, priority: Priority, week?: number): SeedItem => ({ key, scope: 'shared', qty, priority, week });
const task = (key: ItemKey, priority: Priority, week?: number): SeedItem => ({ key, scope: 'shared', qty: 1, priority, week, task: true });

export const SEED: { cat: CatKey; items: SeedItem[] }[] = [
  {
    cat: 'sleeping',
    items: [
      per('cot', 1, 'must', 34),
      per('mattress', 1, 'must', 34),
      per('mattressProtector', 2, 'must', 34),
      per('fittedSheets', 3, 'must', 34),
      per('sleepingBags', 3, 'must', 34),
      shared('monitor', 1, 'nice'),
      shared('whiteNoise', 1, 'nice'),
      shared('blackoutBlind', 1, 'nice'),
    ],
  },
  {
    cat: 'feeding',
    items: [
      per('bottles', 4, 'must', 34),
      shared('bottleBrush', 1, 'must', 34),
      shared('sterilizer', 1, 'must', 34),
      shared('dryingRack', 1, 'nice'),
      shared('breastPump', 1, 'nice'),
      shared('milkBags', 1, 'nice'),
      shared('nursingPillow', 1, 'nice'),
      shared('formulaDispenser', 1, 'nice'),
      shared('bottleWarmer', 1, 'nice'),
      per('muslins', 6, 'must', 34),
      per('bibs', 5, 'nice'),
    ],
  },
  {
    cat: 'diapering',
    items: [
      shared('diapers', 4, 'must', 34),
      shared('wipes', 10, 'must', 34),
      shared('diaperCream', 2, 'must', 34),
      shared('diaperBin', 1, 'nice'),
      shared('bathTub', 1, 'must', 36),
      per('hoodedTowels', 2, 'must', 36),
      per('washcloths', 4, 'nice'),
      shared('babyWash', 1, 'must', 36),
      shared('bathThermometer', 1, 'nice'),
    ],
  },
  {
    cat: 'clothing',
    items: [
      per('bodysuitsNb', 6, 'must', 34),
      per('sleepsuitsNb', 6, 'must', 34),
      per('bodysuits03', 6, 'must', 36),
      per('sleepsuits03', 6, 'must', 36),
      per('hats', 2, 'must', 34),
      per('socksMittens', 4, 'must', 34),
      per('cardigans', 2, 'nice'),
      per('outerwear', 1, 'nice'),
      task('washClothes', 'must', 35),
    ],
  },
  {
    cat: 'travel',
    items: [
      shared('twinStroller', 1, 'must', 34),
      per('carSeat', 1, 'must', 32),
      task('installCarSeats', 'must', 33),
      shared('carrier', 2, 'nice'),
      shared('changingBag', 1, 'must', 34),
      shared('rainCover', 1, 'nice'),
    ],
  },
  {
    cat: 'health',
    items: [
      shared('thermometer', 1, 'must', 34),
      shared('firstAid', 1, 'must', 34),
      shared('nailClippers', 1, 'must', 36),
      shared('nasalAspirator', 1, 'nice'),
      shared('medSyringe', 2, 'nice'),
      task('smokeAlarms', 'nice', 34),
    ],
  },
  {
    cat: 'hospital',
    items: [
      shared('hbMotherClothes', 1, 'must', 30),
      shared('hbNursingBras', 2, 'must', 30),
      shared('hbMaternityPads', 2, 'must', 30),
      shared('hbToiletries', 1, 'must', 30),
      shared('hbPartner', 1, 'nice', 30),
      shared('hbChargers', 1, 'must', 30),
      shared('hbDocuments', 1, 'must', 30),
      per('hbBabyOutfit', 1, 'must', 30),
      per('hbBabyBlanket', 1, 'must', 30),
      shared('hbBabyDiapers', 1, 'must', 30),
      task('packBag', 'must', 31),
    ],
  },
  {
    cat: 'home',
    items: [
      shared('changingStation', 1, 'must', 34),
      shared('changingMats', 2, 'must', 34),
      shared('nightLight', 1, 'must', 34),
      shared('feedingChair', 1, 'nice'),
      shared('diaperCaddy', 2, 'nice'),
      task('nightStation', 'must', 35),
      task('freezerMeals', 'nice', 35),
    ],
  },
  {
    cat: 'paperwork',
    items: [task('admin1', 'must'), task('admin2', 'must'), task('admin3', 'must')],
  },
];

const meta = { createdAt: SEED_TIME, updatedAt: SEED_TIME, deletedAt: null, deviceId: SEED_DEVICE };

export function seedRecords(): { categories: Category[]; items: PrepItem[] } {
  const categories: Category[] = [];
  const items: PrepItem[] = [];
  SEED.forEach(({ cat, items: seedItems }, catIndex) => {
    const categoryId = `seed-cat-${cat}`;
    categories.push({ ...meta, id: categoryId, name: seedEn.cat[cat], seedKey: `seed.cat.${cat}`, order: catIndex });
    seedItems.forEach((s, i) => {
      items.push({
        ...meta,
        id: `seed-item-${s.key}`,
        kind: s.task ? 'task' : 'item',
        name: seedEn.item[s.key],
        seedKey: `seed.item.${s.key}`,
        categoryId,
        scope: s.scope,
        quantity: s.qty,
        acquired: 0,
        priority: s.priority,
        status: 'needed',
        estimatedUnitPrice: null,
        actualPrice: null,
        store: '',
        link: '',
        notes: '',
        neededBy: s.week ? { kind: 'week', week: s.week } : null,
        done: false,
        order: i,
      });
    });
  });
  return { categories, items };
}

/** Adds the starter checklist once per device. Safe to run again: existing (edited or deleted) records are kept. */
export async function seedChecklistIfNeeded(store: DataStore): Promise<void> {
  const prefs = await store.device.get();
  if ((prefs.seedVersion ?? 0) >= SEED_VERSION) return;
  const { categories, items } = seedRecords();
  await store.transaction(async () => {
    await store.categories.merge(categories);
    await store.prepItems.merge(items);
    await store.device.update({ seedVersion: SEED_VERSION });
  });
}
