import { describe, expect, it } from 'vitest';
import type { Caregiver, LogEntry, NightShift } from '@/data/types';
import { caregiverList } from '@/lib/caregivers';
import { alertsAllowed, handoverSummary, onDutyNow } from './logic';

const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);
const shifts: NightShift[] = [
  { caregiverId: 'p2', from: '22:00', to: '02:00' },
  { caregiverId: 'p1', from: '02:00', to: '06:00' },
];

describe('night duty', () => {
  it('finds who is on duty, including shifts that run past midnight', () => {
    expect(onDutyNow(shifts, local(11, 23, 30))).toEqual({ caregiverId: 'p2', until: local(12, 2) });
    expect(onDutyNow(shifts, local(12, 1, 59))).toEqual({ caregiverId: 'p2', until: local(12, 2) });
    expect(onDutyNow(shifts, local(12, 2))).toEqual({ caregiverId: 'p1', until: local(12, 6) });
    expect(onDutyNow(shifts, local(12, 6))).toBeNull();
    expect(onDutyNow(shifts, local(12, 15))).toBeNull();
    expect(onDutyNow([], local(12, 1))).toBeNull();
  });

  it('keeps alerts quiet only while someone else is on duty, in "on duty" mode', () => {
    const night = local(11, 23);
    expect(alertsAllowed('always', shifts, 'p1', night)).toBe(true);
    expect(alertsAllowed(undefined, shifts, 'p1', night)).toBe(true);
    expect(alertsAllowed('onDuty', shifts, 'p1', night)).toBe(false);
    expect(alertsAllowed('onDuty', shifts, 'p2', night)).toBe(true);
    // Daytime, nobody on duty: alerts as usual.
    expect(alertsAllowed('onDuty', shifts, 'p1', local(12, 14))).toBe(true);
  });
});

let n = 0;
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
    loggedBy: 'p2',
    ...e,
  }) as LogEntry;

describe('handover', () => {
  const now = local(11, 9);
  const lastSeen = local(11, 3).toISOString();
  const entries = [
    entry({ type: 'feed', data: { method: 'bottle', ml: 90, milk: 'formula' }, start: local(11, 2).toISOString() }),
    entry({ type: 'feed', data: { method: 'bottle', ml: 80, milk: 'formula' }, start: local(11, 4).toISOString() }),
    entry({
      type: 'feed',
      data: { method: 'bottle', ml: 70, milk: 'formula' },
      start: local(11, 5).toISOString(),
      babyId: 'baby-B',
      loggedBy: 'h1',
    }),
    entry({ type: 'diaper', data: { kind: 'both' }, start: local(11, 6).toISOString() }),
    entry({ type: 'sleep', data: {}, start: local(11, 2).toISOString(), end: local(11, 5).toISOString(), babyId: 'baby-B' }),
    entry({ type: 'med', data: { name: 'D', dose: '' }, start: local(11, 8).toISOString(), loggedBy: 'h1' }),
  ];

  it('sums what happened per twin since this phone was last used, and who logged it', () => {
    const h = handoverSummary(entries, lastSeen, now)!;
    expect(h.count).toBe(4);
    expect(h.perTwin.A).toMatchObject({ feeds: 1, ml: 80, diapers: 1, wet: 1, dirty: 1, meds: 1 });
    // The sleep started before, so only the part since 03:00 counts.
    expect(h.perTwin.B).toMatchObject({ feeds: 1, ml: 70, sleepMinutes: 120 });
    expect(h.loggedBy).toEqual(['p2', 'h1']);
  });

  it('stays away after a short gap, without a previous visit, or when nothing new was logged', () => {
    expect(handoverSummary(entries, local(11, 8, 50).toISOString(), now)).toBeNull();
    expect(handoverSummary(entries, null, now)).toBeNull();
    expect(handoverSummary(entries, local(11, 8, 30).toISOString(), local(11, 10))).toBeNull();
  });
});

describe('caregivers', () => {
  const helper = (id: string, name: string, order: number, deletedAt: string | null = null): Caregiver => ({
    id,
    name,
    order,
    createdAt: '',
    updatedAt: '',
    deletedAt,
    deviceId: 'd',
  });

  it('lists the parents first, then helpers in order, with default names', () => {
    const list = caregiverList(
      { parent1Name: 'Darko', parent2Name: '' },
      [helper('h2', 'Nanny', 2), helper('h1', 'Baba', 1), helper('h3', 'Gone', 0, 'x')],
      {
        p1: 'Parent 1',
        p2: 'Parent 2',
        helper: 'Helper',
      },
    );
    expect(list.map((c) => [c.id, c.name, c.isParent])).toEqual([
      ['p1', 'Darko', true],
      ['p2', 'Parent 2', true],
      ['h1', 'Baba', false],
      ['h2', 'Nanny', false],
    ]);
  });
});
