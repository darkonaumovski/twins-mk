import { describe, expect, it } from 'vitest';
import type { DiaperData, LogEntry } from '@/data/types';
import { openDexieStore } from '@/data/dexieStore';
import { buildEntries } from './logic';
import {
  detailMarks,
  detailsOf,
  diaperBreakdown,
  diaperData,
  hasDetails,
  NO_DETAILS,
  savesDetails,
  type DetailLabel,
} from './diaperDetails';

let n = 0;
const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const diaper = (data: DiaperData, start: string, over: Partial<LogEntry> = {}): LogEntry =>
  ({
    id: `d${++n}`,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    deviceId: 'd',
    babyId: 'baby-A',
    type: 'diaper',
    data,
    start,
    end: null,
    groupId: null,
    loggedBy: 'p1',
    ...over,
  }) as LogEntry;

describe('diaper details in the entry', () => {
  it('stores nothing extra when nothing was noted (same as a quick tap)', () => {
    expect(diaperData('dirty', NO_DETAILS)).toEqual({ kind: 'dirty' });
  });

  it('keeps rash, colour and texture for a dirty diaper', () => {
    expect(diaperData('both', { rash: true, color: 'green', texture: 'soft' })).toEqual({
      kind: 'both',
      rash: true,
      color: 'green',
      texture: 'soft',
    });
  });

  it('drops colour and texture when the diaper is only wet, but keeps a rash', () => {
    expect(diaperData('wet', { rash: true, color: 'green', texture: 'soft' })).toEqual({ kind: 'wet', rash: true });
  });

  it('reads older entries without details, and ignores values it does not know', () => {
    expect(detailsOf({ kind: 'dirty' })).toEqual(NO_DETAILS);
    expect(hasDetails(detailsOf({ kind: 'dirty' }))).toBe(false);
    expect(detailsOf({ kind: 'dirty', color: 'blue' as never, texture: 'hard' })).toEqual({ rash: false, color: null, texture: 'hard' });
    expect(detailsOf({ kind: 'wet', color: 'yellow' })).toEqual(NO_DETAILS);
  });

  it('gives each twin the same details for a "both twins" entry, linked', () => {
    const data = diaperData('dirty', { rash: false, color: 'yellow', texture: null });
    const entries = buildEntries('both', { type: 'diaper', data, start: local(11, 9), end: null }, 'p1', () => 'g');
    expect(entries.map((e) => [e.babyId, e.groupId, e.data])).toEqual([
      ['baby-A', 'g', { kind: 'dirty', color: 'yellow' }],
      ['baby-B', 'g', { kind: 'dirty', color: 'yellow' }],
    ]);
  });

  it('keeps the details when the entry is edited later, without touching the other twin', async () => {
    const store = await openDexieStore({ name: 'diaper-details-edit' });
    const [a, b] = await store.logs.createMany(
      buildEntries('both', { type: 'diaper', data: { kind: 'dirty' }, start: local(11, 9), end: null }, 'p1', () => 'g'),
    );
    await store.logs.update(a.id, { data: diaperData('dirty', { rash: true, color: 'brown', texture: 'formed' }) });
    expect((await store.logs.get(a.id))?.data).toEqual({ kind: 'dirty', rash: true, color: 'brown', texture: 'formed' });
    expect(await store.logs.get(b.id)).toEqual(b);
  });
});

describe('diaper breakdown for the report', () => {
  const entries = [
    diaper({ kind: 'dirty', color: 'green', texture: 'soft', rash: true }, local(11, 23, 59)),
    diaper({ kind: 'dirty', color: 'yellow', texture: 'soft' }, local(12, 0, 0)),
    diaper({ kind: 'both', color: 'yellow' }, local(12, 8)),
    diaper({ kind: 'wet', rash: true }, local(12, 9)),
    diaper({ kind: 'dirty' }, local(12, 10)),
    diaper({ kind: 'dirty', color: 'black' }, local(12, 11), { deletedAt: 'x' }),
    diaper({ kind: 'dirty', color: 'red', rash: true }, local(12, 12), { babyId: 'baby-B' }),
  ];

  it('counts per day, with midnight belonging to the new day', () => {
    expect(diaperBreakdown(entries, 'baby-A', new Date(2026, 9, 11), new Date(2026, 9, 12))).toEqual({
      rash: 1,
      colors: [['green', 1]],
      textures: [['soft', 1]],
    });
    expect(diaperBreakdown(entries, 'baby-A', new Date(2026, 9, 12), new Date(2026, 9, 13))).toEqual({
      rash: 1,
      colors: [['yellow', 2]],
      textures: [['soft', 1]],
    });
  });

  it('keeps the twins apart and leaves out deleted entries, in a fixed colour order', () => {
    const all = diaperBreakdown(entries, 'baby-A', new Date(2026, 9, 1), new Date(2026, 9, 31));
    expect(all.colors).toEqual([
      ['yellow', 2],
      ['green', 1],
    ]);
    expect(diaperBreakdown(entries, 'baby-B', new Date(2026, 9, 1), new Date(2026, 9, 31))).toEqual({
      rash: 1,
      colors: [['red', 1]],
      textures: [],
    });
  });

  it('is empty for older entries without details', () => {
    const old = [diaper({ kind: 'dirty' }, local(12, 8))];
    expect(diaperBreakdown(old, 'baby-A', new Date(2026, 9, 12), new Date(2026, 9, 13))).toEqual({ rash: 0, colors: [], textures: [] });
  });
});

describe('timeline words', () => {
  const label: DetailLabel = (key) =>
    ({ 'diaper.rashMark': 'rash', 'diaper.colors.green': 'Green', 'diaper.textures.soft': 'Soft' })[key as string] ?? key;

  it('adds rash, colour and texture as lower-case words', () => {
    expect(detailMarks({ kind: 'dirty', rash: true, color: 'green', texture: 'soft' }, label)).toEqual(['rash', 'green', 'soft']);
  });

  it('adds nothing for an entry without details or an older one', () => {
    expect(detailMarks({ kind: 'dirty' }, label)).toEqual([]);
    expect(detailMarks({ kind: 'wet', color: 'green' }, label)).toEqual([]);
  });

  it('tells the editor whether saving would store any detail', () => {
    expect(savesDetails('wet', { rash: false, color: 'green', texture: 'soft' })).toBe(false);
    expect(savesDetails('wet', { rash: true, color: null, texture: null })).toBe(true);
    expect(savesDetails('dirty', { rash: false, color: 'green', texture: null })).toBe(true);
  });
});
