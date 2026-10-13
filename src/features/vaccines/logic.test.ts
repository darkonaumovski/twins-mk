import { describe, expect, it } from 'vitest';
import { openDexieStore } from '@/data/dexieStore';
import { exportBackup, importBackup, parseBackup } from '@/data/backup';
import type { Vaccine } from '@/data/types';
import {
  nameSuggestions,
  nextDose,
  parseDose,
  placeSuggestions,
  scopeOf,
  vaccineRecords,
  vaccinesBySlot,
  vaccinesInPeriod,
  type VaccineFields,
} from './logic';

const fields = (over: Partial<VaccineFields> = {}): VaccineFields => ({
  name: 'Hexa',
  dose: 1,
  date: '2026-10-10',
  place: 'Health centre',
  lot: '',
  notes: '',
  ...over,
});

let n = 0;
const v = (over: Partial<Vaccine>): Vaccine => ({
  id: `v${++n}`,
  createdAt: '2026-10-10T08:00:00.000Z',
  updatedAt: '2026-10-10T08:00:00.000Z',
  deletedAt: null,
  deviceId: 'd',
  babyId: 'baby-A',
  name: 'Hexa',
  dose: 1,
  date: '2026-10-10',
  place: '',
  lot: '',
  notes: '',
  groupId: null,
  ...over,
});

describe('new vaccination records', () => {
  it('makes two linked records for both twins', () => {
    const records = vaccineRecords('both', fields(), () => 'g1');
    expect(records.map((r) => [r.babyId, r.groupId])).toEqual([
      ['baby-A', 'g1'],
      ['baby-B', 'g1'],
    ]);
    expect(records[0]).toMatchObject({ name: 'Hexa', dose: 1, date: '2026-10-10', place: 'Health centre' });
  });

  it('makes one unlinked record for one twin', () => {
    expect(vaccineRecords('B', fields(), () => 'g1')).toEqual([expect.objectContaining({ babyId: 'baby-B', groupId: null })]);
  });

  it('trims text and keeps only a whole dose number from 1 up', () => {
    const [r] = vaccineRecords(
      'A',
      fields({ name: '  BCG ', place: ' Maternity ', lot: ' AB12 ', notes: ' red spot ', dose: 0 }),
      () => '',
    );
    expect(r).toMatchObject({ name: 'BCG', place: 'Maternity', lot: 'AB12', notes: 'red spot', dose: null });
    expect(vaccineRecords('A', fields({ dose: 2.4 }), () => '')[0].dose).toBeNull();
    expect(vaccineRecords('A', fields({ dose: Number.NaN }), () => '')[0].dose).toBeNull();
    expect(vaccineRecords('A', fields({ dose: 3 }), () => '')[0].dose).toBe(3);
  });

  it('reads the typed dose: empty is not noted, anything but a whole number from 1 is asked again', () => {
    expect(parseDose('')).toBeNull();
    expect(parseDose('  ')).toBeNull();
    expect(parseDose(' 2 ')).toBe(2);
    expect(parseDose('2,5')).toBe('invalid');
    expect(parseDose('2.5')).toBe('invalid');
    expect(parseDose('0')).toBe('invalid');
    expect(parseDose('-1')).toBe('invalid');
    expect(parseDose('втора')).toBe('invalid');
  });
});

describe('the list', () => {
  it('puts each twin in its own column, newest first, without deleted ones', () => {
    const list = [
      v({ id: 'a1', date: '2026-08-01' }),
      v({ id: 'a2', date: '2026-10-01' }),
      v({ id: 'b1', babyId: 'baby-B', date: '2026-09-01' }),
      v({ id: 'gone', date: '2026-10-05', deletedAt: '2026-10-06T00:00:00.000Z' }),
    ];
    const cols = vaccinesBySlot(list);
    expect(cols.A.map((x) => x.id)).toEqual(['a2', 'a1']);
    expect(cols.B.map((x) => x.id)).toEqual(['b1']);
  });

  it('offers the names already used, most recent first, once each', () => {
    const list = [
      v({ name: 'Hexa', date: '2026-08-01' }),
      v({ name: 'hexa ', date: '2026-10-01' }),
      v({ name: 'BCG', date: '2026-06-01' }),
      v({ name: 'Old', date: '2026-09-01', deletedAt: 'x' }),
    ];
    expect(nameSuggestions(list)).toEqual(['hexa', 'BCG']);
    expect(nameSuggestions([])).toEqual([]);
  });

  it('offers the places already used the same way, skipping empty ones', () => {
    const list = [
      v({ place: 'Health centre', date: '2026-08-01' }),
      v({ place: 'health centre ', date: '2026-10-01' }),
      v({ place: '', date: '2026-10-02' }),
      v({ place: 'Maternity', date: '2026-06-01' }),
    ];
    expect(placeSuggestions(list)).toEqual(['health centre', 'Maternity']);
  });
});

describe('plan next dose', () => {
  it('is for both twins while the linked record still exists', () => {
    const a = v({ id: 'a', groupId: 'g' });
    const b = v({ id: 'b', babyId: 'baby-B', groupId: 'g' });
    expect(scopeOf(a, [a, b])).toBe('both');
    expect(scopeOf(a, [a, { ...b, deletedAt: 'x' }])).toBe('A');
    expect(scopeOf(b, [b])).toBe('B');
    expect(scopeOf(v({ babyId: 'baby-B' }), [])).toBe('B');
  });

  it('counts the dose on, or leaves it open when none was noted', () => {
    expect(nextDose({ dose: 2 })).toBe(3);
    expect(nextDose({ dose: null })).toBeNull();
  });
});

describe('vaccinations in the report period', () => {
  const list = [
    v({ id: 'before', date: '2026-10-03' }),
    v({ id: 'first', date: '2026-10-04' }),
    v({ id: 'b', babyId: 'baby-B', date: '2026-10-08' }),
    v({ id: 'last', date: '2026-10-10' }),
    v({ id: 'after', date: '2026-10-11' }),
    v({ id: 'deleted', date: '2026-10-05', deletedAt: 'x' }),
  ];

  it('includes both ends of the period, oldest first', () => {
    expect(vaccinesInPeriod(list, ['A', 'B'], '2026-10-04', '2026-10-10').map((x) => x.id)).toEqual(['first', 'b', 'last']);
  });

  it('only lists the chosen twin', () => {
    expect(vaccinesInPeriod(list, ['B'], '2026-10-01', '2026-10-31').map((x) => x.id)).toEqual(['b']);
  });
});

describe('stored and synced', () => {
  it('editing one twin’s record does not change the other', async () => {
    const store = await openDexieStore({ name: 'vaccines-edit' });
    const [a, b] = await store.vaccines.createMany(vaccineRecords('both', fields(), () => 'g1'));
    await store.vaccines.update(a.id, { notes: 'slept a lot after', lot: 'X1' });
    expect(await store.vaccines.get(b.id)).toEqual(b);
    expect((await store.vaccines.get(a.id))?.notes).toBe('slept a lot after');
  });

  it('round-trips through a backup to the other phone, with the link and a deleted record', async () => {
    const phone1 = await openDexieStore({ name: 'vaccines-backup-1' });
    const phone2 = await openDexieStore({ name: 'vaccines-backup-2' });
    const [a, b] = await phone1.vaccines.createMany(vaccineRecords('both', fields(), () => 'g1'));
    await phone1.vaccines.remove(b.id);

    await importBackup(phone2, parseBackup(JSON.stringify(await exportBackup(phone1))));
    expect(await phone2.vaccines.list()).toEqual([a]);
    expect((await phone2.vaccines.listAll()).find((x) => x.id === b.id)?.deletedAt).not.toBeNull();
  });
});
