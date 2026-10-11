import { describe, expect, it } from 'vitest';
import type { Milestone } from '@/data/types';
import { MILESTONE_KEYS, milestoneId, milestoneRows } from './logic';

const m = (id: string, babyId: string, over: Partial<Milestone>): Milestone => ({
  id,
  babyId,
  key: null,
  title: '',
  date: null,
  note: '',
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  deviceId: 'd',
  ...over,
});

describe('milestones', () => {
  it('puts both twins side by side, built-in milestones first', () => {
    const records = [
      m(milestoneId('smile', 'baby-A'), 'baby-A', { key: 'smile', date: '2026-10-20' }),
      m(milestoneId('smile', 'baby-B'), 'baby-B', { key: 'smile', date: '2026-10-25' }),
      m('c1', 'baby-B', { title: 'First bath in the big tub', date: '2026-11-02' }),
      m('c2', 'baby-A', { title: 'first bath in the big tub ', date: '2026-11-03' }),
      m('c3', 'baby-A', { title: 'Met grandma', date: '2026-10-12' }),
      m('gone', 'baby-A', { title: 'Deleted', deletedAt: 'x' }),
    ];
    const rows = milestoneRows(records);
    expect(rows.slice(0, MILESTONE_KEYS.length).map((r) => r.key)).toEqual([...MILESTONE_KEYS]);
    expect(rows[0].cells.A?.date).toBe('2026-10-20');
    expect(rows[0].cells.B?.date).toBe('2026-10-25');
    const custom = rows.slice(MILESTONE_KEYS.length);
    expect(custom.map((r) => [r.title, r.cells.A?.id, r.cells.B?.id])).toEqual([
      ['Met grandma', 'c3', undefined],
      ['First bath in the big tub', 'c2', 'c1'],
    ]);
  });

  it('uses fixed ids for built-in milestones, so two phones never duplicate them', () => {
    expect(milestoneId('smile', 'baby-A')).toBe('milestone-smile-baby-A');
  });
});
