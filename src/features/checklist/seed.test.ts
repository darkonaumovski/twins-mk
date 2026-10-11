import { describe, expect, it } from 'vitest';
import { openDexieStore } from '@/data/dexieStore';
import { exportBackup, importBackup } from '@/data/backup';
import en from '@/i18n/locales/en';
import mk from '@/i18n/locales/mk';
import { seedChecklistIfNeeded, seedRecords } from './seed';

let n = 0;
const open = () => openDexieStore({ name: `seed-test-${++n}` });

function lookup(tree: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree);
}

describe('seed data', () => {
  const { categories, items } = seedRecords();

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
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId['seed-item-carSeat']).toMatchObject({ scope: 'perBaby', quantity: 1 });
    expect(byId['seed-item-sterilizer']).toMatchObject({ scope: 'shared', quantity: 1 });
  });

  it('leaves paperwork as editable placeholder to-dos and prices empty', () => {
    const paperwork = items.filter((i) => i.categoryId === 'seed-cat-paperwork');
    expect(paperwork.every((i) => i.kind === 'task')).toBe(true);
    expect(items.every((i) => i.estimatedUnitPrice === null && i.actualPrice === null)).toBe(true);
  });
});

describe('seedChecklistIfNeeded', () => {
  it('seeds once and does not resurrect deleted items', async () => {
    const store = await open();
    await seedChecklistIfNeeded(store);
    const count = (await store.prepItems.list()).length;
    expect(count).toBe(seedRecords().items.length);

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
    expect(items.length).toBe(seedRecords().items.length);
    expect(items.find((i) => i.id === 'seed-item-cot')).toMatchObject({ acquired: 2, status: 'gifted' });
  });
});
