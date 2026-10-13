import { describe, expect, it } from 'vitest';
import { openDexieStore } from '@/data/dexieStore';
import { exportBackup, importBackup, parseBackup } from '@/data/backup';
import type { Baby, JournalEntry, Milestone, Photo } from '@/data/types';
import { buildBook, type BookOptions } from './book';

const meta = { createdAt: '', updatedAt: '', deletedAt: null, deviceId: 'd' };
const baby = (slot: 'A' | 'B', over: Partial<Baby> = {}): Baby => ({
  ...meta,
  id: `baby-${slot}`,
  slot,
  name: slot === 'A' ? 'Ема' : 'Ана',
  color: 'teal',
  birthDateTime: new Date(2026, 6, 1, 8, 30).toISOString(),
  birthWeightG: slot === 'A' ? 2400 : 2300,
  birthLengthCm: 45,
  gestationWeeksAtBirth: 35,
  gestationDaysAtBirth: 4,
  ...over,
});
const milestone = (id: string, babyId: string, key: string | null, date: string | null, title = ''): Milestone => ({
  ...meta,
  id,
  babyId,
  key,
  title,
  date,
  note: '',
});
const entry = (id: string, date: string, inBook: boolean | undefined, over: Partial<JournalEntry> = {}): JournalEntry => ({
  ...meta,
  id,
  date,
  babies: 'both',
  text: `entry ${id}`,
  ...(inBook === undefined ? {} : { inBook }),
  ...over,
});
const photo = (id: string, owner: Photo['owner'], takenAt = '2026-08-01T10:00:00.000Z'): Photo => ({
  ...meta,
  id,
  takenAt,
  owner,
  babies: 'both',
  width: 10,
  height: 10,
  bytes: 1,
  uploaded: true,
});
const all: BookOptions = { from: null, to: null, includePhotos: true };

const input = {
  babies: { A: baby('A'), B: baby('B', { gestationWeeksAtBirth: null, gestationDaysAtBirth: null }) },
  milestones: [
    milestone('m-smile-A', 'baby-A', 'smile', '2026-09-05'),
    milestone('m-smile-B', 'baby-B', 'smile', '2026-08-30'),
    milestone('m-laugh-A', 'baby-A', 'laugh', '2026-08-20'),
    milestone('m-tooth-A', 'baby-A', 'firstTooth', null),
    milestone('m-custom-B', 'baby-B', null, '2026-10-01', 'First bath with dad'),
    { ...milestone('m-gone', 'baby-A', 'crawl', '2026-09-01'), deletedAt: 'x' },
  ],
  journal: [
    entry('j2', '2026-08-15', true),
    entry('j1', '2026-08-02', true),
    entry('j3', '2026-08-20', false),
    entry('j4', '2026-09-10', undefined),
    { ...entry('j5', '2026-09-11', true), deletedAt: 'x' },
    entry('j6', '2026-10-03', true, { babies: 'A' }),
  ],
  photos: [
    photo('p-month-aug', { kind: 'monthly', id: '2026-08' }),
    photo('p-smile', { kind: 'milestone', id: 'm-smile-A' }),
    photo('p-j2', { kind: 'journal', id: 'j2' }),
    { ...photo('p-gone', { kind: 'monthly', id: '2026-09' }), deletedAt: 'x' },
  ],
};

describe('keepsake book', () => {
  it('has a cover with both names and the birth date, and birth details side by side', () => {
    const book = buildBook(input, all);
    expect(book.cover).toEqual({ names: { A: 'Ема', B: 'Ана' }, birthDate: '2026-07-01' });
    expect(book.births.map((b) => [b.slot, b.weightG, b.gestation])).toEqual([
      ['A', 2400, { weeks: 35, days: 4 }],
      ['B', 2300, null],
    ]);
  });

  it('lists dated milestones side by side, oldest first, with age and corrected age', () => {
    const book = buildBook(input, all);
    expect(book.milestones.map((m) => m.key ?? m.title)).toEqual(['laugh', 'smile', 'First bath with dad']);
    const smile = book.milestones[1];
    // Born 1 July at 35+4 (31 days before term): 5 September is day 66, corrected 35.
    expect(smile.cells.A).toEqual({ date: '2026-09-05', ageDays: 66, correctedDays: 35, note: '', photoIds: ['p-smile'] });
    // Twin B has no weeks of pregnancy entered: no corrected age.
    expect(smile.cells.B).toMatchObject({ date: '2026-08-30', ageDays: 60, correctedDays: null });
  });

  it('has one page per month with the monthly photo and the entries put in the book, skipping empty months', () => {
    const book = buildBook(input, all);
    expect(book.months.map((m) => [m.month, m.photoIds, m.entries.map((e) => e.id)])).toEqual([
      ['2026-08', ['p-month-aug'], ['j1', 'j2']],
      ['2026-10', [], ['j6']],
    ]);
    expect(book.months[0].entries[1].photoIds).toEqual(['p-j2']);
  });

  it('keeps to the chosen dates', () => {
    const book = buildBook(input, { from: '2026-09-01', to: '2026-09-30', includePhotos: true });
    expect(book.milestones.map((m) => [m.key, Object.keys(m.cells)])).toEqual([['smile', ['A']]]);
    expect(book.months).toEqual([]);
    const august = buildBook(input, { from: '2026-08-10', to: '2026-08-31', includePhotos: true });
    expect(august.months.map((m) => [m.month, m.photoIds, m.entries.map((e) => e.id)])).toEqual([['2026-08', ['p-month-aug'], ['j2']]]);
  });

  it('can leave the photos out (a month with only a photo then has no page)', () => {
    const book = buildBook(input, { ...all, includePhotos: false });
    expect(book.milestones[1].cells.A?.photoIds).toEqual([]);
    expect(book.months.map((m) => [m.month, m.photoIds])).toEqual([
      ['2026-08', []],
      ['2026-10', []],
    ]);
    const onlyPhoto = buildBook({ ...input, journal: [] }, { ...all, includePhotos: false });
    expect(onlyPhoto.months).toEqual([]);
  });

  it('lists the first foods by the first day either twin tried them', () => {
    const book = buildBook(
      {
        ...input,
        firstFoods: [
          { name: 'Pear', dates: { A: '2027-01-10' } },
          { name: 'Carrot', dates: { A: '2027-01-12', B: '2027-01-05' } },
          { name: 'Rice', dates: {} },
        ],
      },
      all,
    );
    expect(book.firstFoods.map((f) => f.name)).toEqual(['Carrot', 'Pear']);
  });

  it('works for twins without birth details yet', () => {
    const book = buildBook({ babies: {}, milestones: [], journal: [], photos: [] }, all);
    expect(book).toEqual({ cover: { names: {}, birthDate: null }, births: [], milestones: [], months: [], firstFoods: [] });
  });
});

describe('journal', () => {
  it('round-trips through a backup to the other phone, with "in the book" and a deleted entry', async () => {
    const phone1 = await openDexieStore({ name: 'journal-1' });
    const phone2 = await openDexieStore({ name: 'journal-2' });
    const kept = await phone1.journal.create({ date: '2026-10-13', babies: 'both', text: 'First walk outside', inBook: true });
    const gone = await phone1.journal.create({ date: '2026-10-12', babies: 'A', text: 'x' });
    await phone1.journal.remove(gone.id);
    await importBackup(phone2, parseBackup(JSON.stringify(await exportBackup(phone1))));
    expect(await phone2.journal.list()).toEqual([kept]);
    expect((await phone2.journal.listAll()).find((e) => e.id === gone.id)?.deletedAt).not.toBeNull();
  });
});

describe('keepsake book edges', () => {
  it('orders milestones on the same day steadily, and shows a corrected age before the due date as negative', () => {
    const book = buildBook(
      {
        ...input,
        milestones: [
          milestone('a', 'baby-A', 'laugh', '2026-07-20'),
          milestone('b', 'baby-A', 'smile', '2026-07-20'),
          milestone('c', 'baby-B', null, '2026-07-20', 'Opened eyes'),
        ],
      },
      all,
    );
    // Same date: built-in milestones in their usual order, then custom ones.
    expect(book.milestones.map((m) => m.key ?? m.title)).toEqual(['smile', 'laugh', 'Opened eyes']);
    // 19 days old, born 31 days before term: corrected −12.
    expect(book.milestones[0].cells.A).toMatchObject({ ageDays: 19, correctedDays: -12 });
  });

  it('includes entries and milestones exactly on the first and last day of the range', () => {
    const book = buildBook(input, { from: '2026-08-02', to: '2026-08-20', includePhotos: false });
    expect(book.months[0].entries.map((e) => e.id)).toEqual(['j1', 'j2']);
    expect(book.milestones.map((m) => m.key)).toEqual(['laugh']);
  });
});

describe('deleting a journal entry', () => {
  it('takes its photos with it, and an undo brings both back', async () => {
    const { deleteJournalEntry } = await import('./logic');
    const store = await openDexieStore({ name: 'journal-delete' });
    const entry = await store.journal.create({ date: '2026-10-13', babies: 'both', text: 'Park', inBook: true });
    const pic = await store.photos.create({ ...photo('x', { kind: 'journal', id: entry.id }), id: undefined } as never);
    const other = await store.photos.create({ ...photo('y', { kind: 'monthly', id: '2026-10' }), id: undefined } as never);
    const undo = await deleteJournalEntry(store, entry.id);
    expect(await store.journal.list()).toEqual([]);
    expect((await store.photos.list()).map((p) => p.id)).toEqual([other.id]);
    await undo();
    expect((await store.journal.list()).map((e) => e.id)).toEqual([entry.id]);
    expect((await store.photos.list()).map((p) => p.id).sort()).toEqual([pic.id, other.id].sort());
  });
});
