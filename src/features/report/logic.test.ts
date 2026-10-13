import { describe, expect, it } from 'vitest';
import type { DoctorNote, LogEntry } from '@/data/types';
import { daysEnding } from '@/features/history/summary';
import { openNotesFor, reportDiapers, reportRows, reportTotals } from './logic';

let n = 0;
const at = (d: number, h: number) => new Date(2026, 9, d, h).toISOString();
const entry = (e: Partial<LogEntry> & Pick<LogEntry, 'type' | 'data' | 'start'>): LogEntry =>
  ({
    id: `e${++n}`,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    deviceId: 'd',
    babyId: 'baby-A',
    end: null,
    groupId: null,
    loggedBy: 'p1',
    ...e,
  }) as LogEntry;

describe('doctor report', () => {
  const entries = [
    entry({ type: 'feed', data: { method: 'bottle', ml: 90, milk: 'formula' }, start: at(10, 8) }),
    entry({ type: 'feed', data: { method: 'bottle', ml: 60, milk: 'formula' }, start: at(11, 8) }),
    entry({ type: 'feed', data: { method: 'bottle', ml: 70, milk: 'formula' }, start: at(11, 11) }),
    entry({ type: 'diaper', data: { kind: 'dirty' }, start: at(11, 9) }),
    entry({ type: 'feed', data: { method: 'bottle', ml: 50, milk: 'formula' }, start: at(11, 9), babyId: 'baby-B' }),
  ];

  it('counts rashes per day and colours and textures over the period, for one twin', () => {
    const list = [
      ...entries,
      entry({ type: 'diaper', data: { kind: 'dirty', rash: true, color: 'green', texture: 'watery' }, start: at(10, 7) }),
      entry({ type: 'diaper', data: { kind: 'wet', rash: true }, start: at(11, 7) }),
      entry({ type: 'diaper', data: { kind: 'dirty', color: 'green' }, start: at(11, 10), babyId: 'baby-B' }),
      entry({ type: 'diaper', data: { kind: 'dirty', color: 'yellow' }, start: at(8, 7) }),
    ];
    const d = reportDiapers(list, 'baby-A', daysEnding('2026-10-11', 3));
    expect(d.rashByDay).toEqual([0, 1, 1]);
    expect(d.period).toEqual({ rash: 2, colors: [['green', 1]], textures: [['watery', 1]] });
    expect(reportDiapers(entries, 'baby-A', daysEnding('2026-10-11', 3)).period).toEqual({ rash: 0, colors: [], textures: [] });
  });

  it('has one row per day for the chosen twin, and totals', () => {
    const rows = reportRows(entries, 'baby-A', daysEnding('2026-10-11', 3), new Date(2026, 9, 12));
    expect(rows.map((r) => [r.date, r.summary.feeds, r.summary.ml, r.summary.dirty])).toEqual([
      ['2026-10-09', 0, 0, 0],
      ['2026-10-10', 1, 90, 0],
      ['2026-10-11', 2, 130, 1],
    ]);
    expect(reportTotals(rows)).toMatchObject({ feeds: 3, ml: 220, diapers: 1 });
  });

  it('lists notes still to discuss for these twins, and the mother’s only when asked', () => {
    const note = (id: string, babies: DoctorNote['babies'], reviewedAt: string | null = null): DoctorNote => ({
      id,
      text: id,
      babies,
      reviewedAt,
      createdAt: id,
      updatedAt: '',
      deletedAt: null,
      deviceId: 'd',
    });
    const notes = [note('a', 'A'), note('b', 'B'), note('c', 'both'), note('d', 'none'), note('e', 'A', 'x')];
    expect(openNotesFor(notes, ['A']).map((x) => x.id)).toEqual(['a', 'c']);
    expect(openNotesFor(notes, ['A', 'B']).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(openNotesFor(notes, ['A'], true).map((x) => x.id)).toEqual(['a', 'c', 'd']);
    expect(openNotesFor(notes, ['A', 'B'], true).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
