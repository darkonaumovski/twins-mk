import { describe, expect, it } from 'vitest';
import { openDexieStore } from '@/data/dexieStore';
import { exportBackup, importBackup } from '@/data/backup';
import type { PrepItem } from '@/data/types';
import en from '@/i18n/locales/en';
import mk from '@/i18n/locales/mk';
import { planSeedUpgrade, SEED_TIME, SEED_TIME_V2, SEED_VERSION, seedChecklistIfNeeded, seedRecords } from './seed';

let n = 0;
const open = () => openDexieStore({ name: `seed-test-${++n}` });

function lookup(tree: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree);
}

const liveCount = () => seedRecords().items.filter((i) => i.deletedAt === null).length;
const byId = (records: PrepItem[]) => [...records].sort((a, b) => a.id.localeCompare(b.id));

describe('seed data', () => {
  const { categories, items } = seedRecords();
  const item = (key: string) => items.find((i) => i.id === `seed-item-${key}`)!;

  it('covers all requested categories', () => {
    expect(categories.map((c) => c.id)).toEqual([
      'seed-cat-sleeping',
      'seed-cat-feeding',
      'seed-cat-diapering',
      'seed-cat-clothing',
      'seed-cat-travel',
      'seed-cat-health',
      'seed-cat-hospital',
      'seed-cat-home',
      'seed-cat-paperwork',
    ]);
    for (const c of categories)
      expect(
        items.some((i) => i.categoryId === c.id),
        c.id,
      ).toBe(true);
  });

  it('has unique ids and translated names in every language', () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    for (const r of [...categories, ...items]) {
      expect(lookup(en, r.seedKey!), r.seedKey!).toBeTypeOf('string');
      expect(lookup(mk, r.seedKey!), r.seedKey!).toBeTypeOf('string');
    }
  });

  it('applies the twin logic: two car seats, one sterilizer', () => {
    expect(item('carSeat')).toMatchObject({ scope: 'perBaby', quantity: 1 });
    expect(item('sterilizer')).toMatchObject({ scope: 'shared', quantity: 1 });
  });

  it('has real paperwork to-dos instead of placeholders, and no prices', () => {
    const paperwork = items.filter((i) => i.categoryId === 'seed-cat-paperwork');
    expect(paperwork.every((i) => i.kind === 'task')).toBe(true);
    expect(paperwork.filter((i) => i.deletedAt === null).map((i) => i.id)).toEqual([
      'seed-item-paediatrician',
      'seed-item-maternityLeave',
      'seed-item-registerBirths',
      'seed-item-healthInsurance',
      'seed-item-childBenefits',
    ]);
    // The placeholders ship as tombstones, so phones that still have them drop them.
    for (const key of ['admin1', 'admin2', 'admin3']) {
      expect(item(key)).toMatchObject({ deletedAt: SEED_TIME_V2, updatedAt: SEED_TIME_V2 });
    }
    expect(items.every((i) => i.estimatedUnitPrice === null && i.actualPrice === null)).toBe(true);
  });

  it('plans for twins: more diapers and bottles, pump and pillow as must-haves, ready by week 32', () => {
    expect(item('diapers')).toMatchObject({ quantity: 10, scope: 'shared' });
    expect(item('bottles')).toMatchObject({ quantity: 6, scope: 'perBaby' });
    expect(item('breastPump')).toMatchObject({ priority: 'must' });
    expect(item('nursingPillow')).toMatchObject({ priority: 'must' });
    expect(item('formula')).toMatchObject({ scope: 'shared', priority: 'must', neededBy: { kind: 'week', week: 32 } });
    for (const key of ['bouncer', 'bassinet']) {
      expect(item(key)).toMatchObject({ scope: 'perBaby', priority: 'must', neededBy: { kind: 'week', week: 32 } });
    }
    expect(item('bodysuitsPreemie')).toMatchObject({ scope: 'perBaby', priority: 'nice', neededBy: { kind: 'week', week: 30 } });
    const late = items.filter(
      (i) => i.deletedAt === null && i.kind === 'item' && i.priority === 'must' && i.neededBy?.kind === 'week' && i.neededBy.week > 32,
    );
    expect(late.map((i) => i.id)).toEqual([]);
  });

  it('stamps only the v2 changes with the v2 time', () => {
    expect(item('monitor').updatedAt).toBe(SEED_TIME);
    expect(item('diapers').updatedAt).toBe(SEED_TIME_V2);
    expect(categories.every((c) => c.updatedAt === SEED_TIME)).toBe(true);
  });
});

describe('seedChecklistIfNeeded', () => {
  it('seeds once and does not resurrect deleted items', async () => {
    const store = await open();
    await seedChecklistIfNeeded(store);
    const count = (await store.prepItems.list()).length;
    expect(count).toBe(liveCount());

    await store.prepItems.remove('seed-item-cot');
    await store.device.update({ seedVersion: 0 }); // simulate a re-run
    await seedChecklistIfNeeded(store);
    expect((await store.prepItems.list()).length).toBe(count - 1);
  });

  it('does not duplicate items when two seeded phones merge, and edits win', async () => {
    const phone1 = await open();
    const phone2 = await open();
    await seedChecklistIfNeeded(phone1);
    await seedChecklistIfNeeded(phone2);
    await phone2.prepItems.update('seed-item-cot', { acquired: 2, status: 'gifted' });

    await importBackup(phone1, await exportBackup(phone2));
    const items = await phone1.prepItems.list();
    expect(items.length).toBe(liveCount());
    expect(items.find((i) => i.id === 'seed-item-cot')).toMatchObject({ acquired: 2, status: 'gifted' });
  });
});

const NEW_IN_V2 = new Set([
  'bassinet',
  'bouncer',
  'formula',
  'bodysuitsPreemie',
  'sleepsuitsPreemie',
  'hbPumpingBra',
  'hbMilkBottles',
  'paediatrician',
  'maternityLeave',
  'registerBirths',
  'healthInsurance',
  'childBenefits',
]);

/** The starter list as a phone seeded with v1 has it: all at SEED_TIME, placeholders live, v2 items absent. */
function v1Records() {
  const { categories, items } = seedRecords();
  const v1Items = items
    .filter((i) => !NEW_IN_V2.has(i.id.replace('seed-item-', '')))
    .map((i) => ({
      ...i,
      updatedAt: SEED_TIME,
      deletedAt: null,
      ...(i.id === 'seed-item-diapers' ? { quantity: 4, neededBy: { kind: 'week' as const, week: 34 } } : {}),
      ...(i.id === 'seed-item-breastPump' ? { priority: 'nice' as const, neededBy: null } : {}),
    }));
  return { categories, items: v1Items };
}

async function openV1Phone() {
  const store = await open();
  const { categories, items } = v1Records();
  await store.categories.merge(categories);
  await store.prepItems.merge(items);
  await store.device.update({ seedVersion: 1 });
  return store;
}

describe('seed v2 upgrade', () => {
  it('planSeedUpgrade only picks records nobody changed', () => {
    const diapers = seedRecords().items.find((i) => i.id === 'seed-item-diapers')!;
    const untouched: PrepItem = { ...diapers, updatedAt: SEED_TIME, quantity: 4 };
    const edited: PrepItem = { ...diapers, updatedAt: '2026-10-01T10:00:00.000Z', deviceId: 'phone-1', quantity: 7 };
    expect(planSeedUpgrade([untouched], [diapers])).toEqual([diapers]);
    expect(planSeedUpgrade([edited], [diapers])).toEqual([]);
    expect(planSeedUpgrade([], [diapers])).toEqual([diapers]);
    // Already upgraded (for example through sync): nothing to do.
    expect(planSeedUpgrade([diapers], [diapers])).toEqual([]);
  });

  it('upgrades untouched items, adds new ones and drops untouched placeholders', async () => {
    const store = await openV1Phone();
    await seedChecklistIfNeeded(store);
    expect((await store.device.get()).seedVersion).toBe(SEED_VERSION);
    expect(await store.prepItems.get('seed-item-diapers')).toMatchObject({ quantity: 10, updatedAt: SEED_TIME_V2 });
    expect(await store.prepItems.get('seed-item-breastPump')).toMatchObject({ priority: 'must' });
    expect(await store.prepItems.get('seed-item-formula')).toBeDefined();
    expect(await store.prepItems.get('seed-item-admin1')).toBeUndefined();
    // Items that did not change in v2 are not rewritten.
    expect((await store.prepItems.get('seed-item-monitor'))!.updatedAt).toBe(SEED_TIME);
  });

  it('keeps items the parents edited or deleted', async () => {
    const store = await openV1Phone();
    await store.prepItems.update('seed-item-diapers', { quantity: 6, acquired: 2 });
    await store.prepItems.update('seed-item-admin2', { name: 'Open a savings account', seedKey: null });
    await store.prepItems.remove('seed-item-bottles');
    const before = await store.prepItems.get('seed-item-diapers');

    await seedChecklistIfNeeded(store);
    expect(await store.prepItems.get('seed-item-diapers')).toEqual(before);
    expect(await store.prepItems.get('seed-item-admin2')).toMatchObject({ name: 'Open a savings account' });
    expect(await store.prepItems.get('seed-item-bottles')).toBeUndefined();
  });

  it('gives an upgraded phone and a fresh install the same list', async () => {
    const upgraded = await openV1Phone();
    await seedChecklistIfNeeded(upgraded);
    const fresh = await open();
    await seedChecklistIfNeeded(fresh);
    const strip = (records: PrepItem[]) =>
      byId(records).map(({ id, updatedAt, deletedAt, quantity, priority, neededBy }) => ({
        id,
        updatedAt,
        deletedAt,
        quantity,
        priority,
        neededBy,
      }));
    expect(strip(await upgraded.prepItems.listAll())).toEqual(strip(await fresh.prepItems.listAll()));
  });

  it('lets a v1 phone and a v2 phone converge, with edits winning', async () => {
    const oldPhone = await openV1Phone();
    const newPhone = await openV1Phone();
    await oldPhone.prepItems.update('seed-item-wipes', { acquired: 3 });
    await seedChecklistIfNeeded(newPhone);

    await importBackup(oldPhone, await exportBackup(newPhone));
    await importBackup(newPhone, await exportBackup(oldPhone));
    const a = byId(await oldPhone.prepItems.listAll());
    expect(a).toEqual(byId(await newPhone.prepItems.listAll()));
    expect(a.find((i) => i.id === 'seed-item-diapers')).toMatchObject({ quantity: 10 });
    expect(a.find((i) => i.id === 'seed-item-wipes')).toMatchObject({ acquired: 3 });
  });
});
