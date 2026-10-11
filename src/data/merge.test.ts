import { describe, expect, it } from 'vitest';
import { incomingWins, isEntity, planMerge } from './merge';
import type { Entity } from './types';

const rec = (id: string, updatedAt: string, extra: Partial<Entity> & Record<string, unknown> = {}) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt,
  deletedAt: null,
  deviceId: 'dev-a',
  ...extra,
});

describe('incomingWins', () => {
  it('prefers the newer updatedAt', () => {
    expect(incomingWins(rec('1', '2026-01-02T00:00:00.000Z'), rec('1', '2026-01-03T00:00:00.000Z'))).toBe(true);
    expect(incomingWins(rec('1', '2026-01-03T00:00:00.000Z'), rec('1', '2026-01-02T00:00:00.000Z'))).toBe(false);
  });

  it('breaks ties by deviceId, symmetrically', () => {
    const a = rec('1', '2026-01-02T00:00:00.000Z', { deviceId: 'aaa' });
    const b = rec('1', '2026-01-02T00:00:00.000Z', { deviceId: 'bbb' });
    expect(incomingWins(a, b)).toBe(true);
    expect(incomingWins(b, a)).toBe(false);
  });

  it('treats an identical record as unchanged', () => {
    const a = rec('1', '2026-01-02T00:00:00.000Z');
    expect(incomingWins(a, { ...a })).toBe(false);
  });
});

describe('planMerge', () => {
  it('adds new records, updates older ones and skips newer local ones', () => {
    const local = [rec('1', '2026-01-02T00:00:00.000Z'), rec('2', '2026-01-05T00:00:00.000Z')];
    const incoming = [
      rec('1', '2026-01-03T00:00:00.000Z', { title: 'newer' }),
      rec('2', '2026-01-04T00:00:00.000Z', { title: 'older' }),
      rec('3', '2026-01-01T00:00:00.000Z'),
    ];
    const { toWrite, stats } = planMerge(local, incoming);
    expect(stats).toEqual({ added: 1, updated: 1, unchanged: 1 });
    expect(toWrite.map((r) => r.id)).toEqual(['1', '3']);
  });

  it('propagates a newer tombstone', () => {
    const local = [rec('1', '2026-01-02T00:00:00.000Z')];
    const incoming = [rec('1', '2026-01-03T00:00:00.000Z', { deletedAt: '2026-01-03T00:00:00.000Z' })];
    expect(planMerge(local, incoming).toWrite[0].deletedAt).toBe('2026-01-03T00:00:00.000Z');
  });

  it('keeps the newest of duplicate incoming records', () => {
    const incoming = [rec('1', '2026-01-03T00:00:00.000Z', { v: 1 }), rec('1', '2026-01-04T00:00:00.000Z', { v: 2 })];
    const { toWrite } = planMerge([], incoming);
    expect(toWrite.at(-1)).toMatchObject({ v: 2 });
  });
});

describe('isEntity', () => {
  it('validates the metadata shape', () => {
    expect(isEntity(rec('1', '2026-01-02T00:00:00.000Z'))).toBe(true);
    expect(isEntity({ id: '1' })).toBe(false);
    expect(isEntity({ ...rec('', 'x') })).toBe(false);
    expect(isEntity(null)).toBe(false);
  });
});
