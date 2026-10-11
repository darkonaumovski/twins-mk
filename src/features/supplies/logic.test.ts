import { describe, expect, it } from 'vitest';
import type { FeedData, LogEntry, Supply } from '@/data/types';
import { entryUse, restockPatch, supplyEntriesSince, supplyStatus } from './logic';

let n = 0;
const base = { createdAt: '', updatedAt: '', deletedAt: null, deviceId: 'd', end: null, groupId: null, loggedBy: 'p1' as const };
const diaper = (start: string, babyId = 'baby-A'): LogEntry => ({
  ...base,
  id: `d${++n}`,
  babyId,
  start,
  type: 'diaper',
  data: { kind: 'wet' },
});
const feed = (start: string, data: FeedData): LogEntry => ({ ...base, id: `f${++n}`, babyId: 'baby-A', start, type: 'feed', data });

const supply = (over: Partial<Supply> = {}): Supply => ({
  id: 'supply-diapers',
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  deviceId: 'd',
  source: 'diapers',
  stock: 100,
  countedAt: '2026-10-10T12:00:00.000Z',
  packSize: 50,
  lowThresholdDays: 3,
  ...over,
});
const now = new Date('2026-10-11T12:00:00.000Z');

describe('supplies', () => {
  it('counts one diaper per diaper entry (each twin) and formula ml from bottles and top-ups', () => {
    expect(entryUse('diapers', diaper('x'))).toBe(1);
    expect(entryUse('diapers', { ...diaper('x'), deletedAt: 'y' })).toBe(0);
    expect(entryUse('formula', feed('x', { method: 'bottle', ml: 90, milk: 'formula' }))).toBe(90);
    expect(entryUse('formula', feed('x', { method: 'bottle', ml: 90, milk: 'breast' }))).toBe(0);
    expect(entryUse('formula', feed('x', { method: 'breast', side: 'left', topUp: { ml: 30, milk: 'formula' } }))).toBe(30);
  });

  it('subtracts use since the count and estimates days left from the last 3 days', () => {
    // 24 diapers over the last 3 days (8 a day), 10 of them since the count.
    const entries = [
      ...Array.from({ length: 14 }, (_, i) => diaper(new Date(Date.parse('2026-10-08T13:00:00.000Z') + i * 3600_000).toISOString())),
      ...Array.from({ length: 10 }, (_, i) =>
        diaper(new Date(Date.parse('2026-10-10T13:00:00.000Z') + i * 3600_000).toISOString(), 'baby-B'),
      ),
    ];
    const status = supplyStatus(supply(), entries, now);
    expect(status.remaining).toBe(90);
    expect(status.perDay).toBe(8);
    expect(status.daysLeft).toBeCloseTo(11.25);
    expect(status.low).toBe(false);
    expect(supplyStatus(supply({ stock: 20 }), entries, now)).toMatchObject({ remaining: 10, low: true });
  });

  it('has no estimate without recent use, but is low when nothing is left', () => {
    expect(supplyStatus(supply(), [], now)).toEqual({ remaining: 100, perDay: 0, daysLeft: null, low: false });
    expect(supplyStatus(supply({ stock: 0 }), [], now).low).toBe(true);
  });

  it('restocks from what is left now, so neither phone overwrites the other’s use', () => {
    const entries = [diaper('2026-10-11T08:00:00.000Z'), diaper('2026-10-11T09:00:00.000Z')];
    expect(restockPatch(supply(), entries, now)).toEqual({ stock: 148, countedAt: now.toISOString() });
    expect(restockPatch(supply(), entries, now, 2)).toEqual({ stock: 198, countedAt: now.toISOString() });
  });

  it('knows how far back it needs log entries', () => {
    expect(supplyEntriesSince([supply({ countedAt: '2026-09-01T00:00:00.000Z' })], now)).toBe('2026-09-01T00:00:00.000Z');
    expect(supplyEntriesSince([], now)).toBe('2026-10-08T12:00:00.000Z');
  });
});
