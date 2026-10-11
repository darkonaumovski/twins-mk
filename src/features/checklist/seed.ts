import seedEn from '@/i18n/locales/seed.en';
import type { DataStore } from '@/data/repository';
import type { Category, Entity, PrepItem, Priority, Scope } from '@/data/types';

/**
 * The starter checklist. Quantities, priorities and "needed by" weeks are
 * editable suggestions, not recommendations. Prices are left empty on purpose.
 *
 * Seed records use fixed ids and fixed, very old timestamps. That makes
 * seeding idempotent and merge-safe: both phones seed the same records, and
 * any real edit (or delete) on either phone is newer and wins a merge.
 */
export const SEED_VERSION = 2;
/** Timestamp of the original (v1) starter list. A seed record still carrying it was never touched. */
export const SEED_TIME = '2000-01-01T00:00:00.000Z';
/**
 * Timestamp of the v2 changes: later than SEED_TIME, so v2 replaces untouched v1
 * records on every phone, and far older than any real edit, so a user's change wins.
 */
export const SEED_TIME_V2 = '2000-01-02T00:00:00.000Z';
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
  /** Added or changed in seed v2. */
  v2?: boolean;
  /** Dropped in seed v2: kept as a tombstone, so phones that have it remove it unless someone edited it. */
  removed?: boolean;
}

const per = (key: ItemKey, qty: number, priority: Priority, week?: number): SeedItem => ({ key, scope: 'perBaby', qty, priority, week });
const shared = (key: ItemKey, qty: number, priority: Priority, week?: number): SeedItem => ({ key, scope: 'shared', qty, priority, week });
const task = (key: ItemKey, priority: Priority, week?: number): SeedItem => ({ key, scope: 'shared', qty: 1, priority, week, task: true });
const v2 = (item: SeedItem): SeedItem => ({ ...item, v2: true });
const removed = (item: SeedItem): SeedItem => ({ ...item, v2: true, removed: true });

export const SEED: { cat: CatKey; items: SeedItem[] }[] = [
  {
    cat: 'sleeping',
    items: [
      v2(per('cot', 1, 'must', 30)),
      v2(per('mattress', 1, 'must', 30)),
      v2(per('mattressProtector', 2, 'must', 30)),
      v2(per('fittedSheets', 3, 'must', 30)),
      v2(per('sleepingBags', 3, 'must', 30)),
      shared('monitor', 1, 'nice'),
      shared('whiteNoise', 1, 'nice'),
      shared('blackoutBlind', 1, 'nice'),
      v2(per('bassinet', 1, 'must', 32)),
      v2(per('bouncer', 1, 'must', 32)),
    ],
  },
  {
    cat: 'feeding',
    items: [
      v2(per('bottles', 6, 'must', 30)),
      v2(shared('bottleBrush', 1, 'must', 30)),
      v2(shared('sterilizer', 1, 'must', 30)),
      shared('dryingRack', 1, 'nice'),
      v2(shared('breastPump', 1, 'must', 32)),
      shared('milkBags', 1, 'nice'),
      v2(shared('nursingPillow', 1, 'must', 32)),
      shared('formulaDispenser', 1, 'nice'),
      shared('bottleWarmer', 1, 'nice'),
      v2(per('muslins', 6, 'must', 30)),
      per('bibs', 5, 'nice'),
      v2(shared('formula', 1, 'must', 32)),
    ],
  },
  {
    cat: 'diapering',
    items: [
      v2(shared('diapers', 10, 'must', 30)),
      v2(shared('wipes', 10, 'must', 30)),
      v2(shared('diaperCream', 2, 'must', 30)),
      shared('diaperBin', 1, 'nice'),
      v2(shared('bathTub', 1, 'must', 32)),
      v2(per('hoodedTowels', 2, 'must', 32)),
      per('washcloths', 4, 'nice'),
      v2(shared('babyWash', 1, 'must', 32)),
      shared('bathThermometer', 1, 'nice'),
    ],
  },
  {
    cat: 'clothing',
    items: [
      v2(per('bodysuitsNb', 6, 'must', 30)),
      v2(per('sleepsuitsNb', 6, 'must', 30)),
      v2(per('bodysuits03', 6, 'must', 32)),
      v2(per('sleepsuits03', 6, 'must', 32)),
      v2(per('hats', 2, 'must', 30)),
      v2(per('socksMittens', 4, 'must', 30)),
      per('cardigans', 2, 'nice'),
      per('outerwear', 1, 'nice'),
      v2(task('washClothes', 'must', 31)),
      v2(per('bodysuitsPreemie', 4, 'nice', 30)),
      v2(per('sleepsuitsPreemie', 4, 'nice', 30)),
    ],
  },
  {
    cat: 'travel',
    items: [
      v2(shared('twinStroller', 1, 'must', 30)),
      per('carSeat', 1, 'must', 32),
      task('installCarSeats', 'must', 33),
      shared('carrier', 2, 'nice'),
      v2(shared('changingBag', 1, 'must', 30)),
      shared('rainCover', 1, 'nice'),
    ],
  },
  {
    cat: 'health',
    items: [
      v2(shared('thermometer', 1, 'must', 30)),
      v2(shared('firstAid', 1, 'must', 30)),
      v2(shared('nailClippers', 1, 'must', 32)),
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
      v2(shared('hbPumpingBra', 1, 'nice', 30)),
      v2(shared('hbMilkBottles', 1, 'nice', 30)),
    ],
  },
  {
    cat: 'home',
    items: [
      v2(shared('changingStation', 1, 'must', 30)),
      v2(shared('changingMats', 2, 'must', 30)),
      v2(shared('nightLight', 1, 'must', 30)),
      shared('feedingChair', 1, 'nice'),
      shared('diaperCaddy', 2, 'nice'),
      v2(task('nightStation', 'must', 31)),
      task('freezerMeals', 'nice', 35),
    ],
  },
  {
    cat: 'paperwork',
    items: [
      removed(task('admin1', 'must')),
      removed(task('admin2', 'must')),
      removed(task('admin3', 'must')),
      v2(task('paediatrician', 'must')),
      v2(task('maternityLeave', 'must')),
      v2(task('registerBirths', 'must')),
      v2(task('healthInsurance', 'must')),
      v2(task('childBenefits', 'must')),
    ],
  },
];

const meta = (updatedAt: string) => ({ createdAt: SEED_TIME, updatedAt, deletedAt: null, deviceId: SEED_DEVICE });

/** The current starter list, including tombstones for dropped placeholders. */
export function seedRecords(): { categories: Category[]; items: PrepItem[] } {
  const categories: Category[] = [];
  const items: PrepItem[] = [];
  SEED.forEach(({ cat, items: seedItems }, catIndex) => {
    const categoryId = `seed-cat-${cat}`;
    categories.push({ ...meta(SEED_TIME), id: categoryId, name: seedEn.cat[cat], seedKey: `seed.cat.${cat}`, order: catIndex });
    seedItems.forEach((s, i) => {
      items.push({
        ...meta(s.v2 ? SEED_TIME_V2 : SEED_TIME),
        deletedAt: s.removed ? SEED_TIME_V2 : null,
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

/**
 * Which seed records to write on this phone: new ones, and those whose local
 * copy is still exactly an older starter version (nobody edited or deleted it).
 * Anything a person touched has a real, newer timestamp and is left alone.
 */
export function planSeedUpgrade<T extends Entity>(local: readonly T[], seed: readonly T[]): T[] {
  const byId = new Map(local.map((r) => [r.id, r]));
  return seed.filter((record) => {
    const existing = byId.get(record.id);
    if (!existing) return true;
    return existing.deviceId === SEED_DEVICE && existing.updatedAt < record.updatedAt;
  });
}

/**
 * Adds or upgrades the starter checklist once per device. Safe to run again:
 * edited or deleted records are kept, and the merge's newest-wins rule is a second guard.
 */
export async function seedChecklistIfNeeded(store: DataStore): Promise<void> {
  const prefs = await store.device.get();
  if ((prefs.seedVersion ?? 0) >= SEED_VERSION) return;
  const { categories, items } = seedRecords();
  await store.transaction(async () => {
    await store.categories.merge(planSeedUpgrade(await store.categories.listAll(), categories));
    await store.prepItems.merge(planSeedUpgrade(await store.prepItems.listAll(), items));
    await store.device.update({ seedVersion: SEED_VERSION });
  });
}
