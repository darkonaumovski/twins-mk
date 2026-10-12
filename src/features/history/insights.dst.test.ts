// A daylight-saving night needs a zone that has one (CI runs in UTC). Node applies a TZ change at once
// in a forked test process (vite.config.ts sets pool: 'forks'); the guard below fails loudly if not.
process.env.TZ = 'Europe/Skopje';

import { describe, expect, it } from 'vitest';
import type { LogEntry } from '@/data/types';
import { insightDay, weekInsights } from './insights';

const sleep = (start: Date, end: Date): LogEntry =>
  ({
    id: start.toISOString(),
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    deviceId: 'd',
    babyId: 'baby-A',
    type: 'sleep',
    data: {},
    start: start.toISOString(),
    end: end.toISOString(),
    groupId: null,
    loggedBy: 'p1',
  }) as LogEntry;

describe('insights on a daylight-saving night', () => {
  it('runs in a time zone with daylight saving', () => {
    expect(new Date(2026, 9, 25, 12).getTimezoneOffset()).toBe(-60);
  });

  it('counts the real length of the night the clocks go back (25 Oct 2026)', () => {
    const night = { from: '19:00', to: '07:00' };
    const day = insightDay('2026-10-24', night);
    expect((day.to.getTime() - day.from.getTime()) / 3600_000).toBe(25);
    // 19:00 on the 24th to 07:00 on the 25th is 13 real hours.
    const w = weekInsights(
      [sleep(new Date(2026, 9, 24, 19), new Date(2026, 9, 25, 7))],
      'baby-A',
      '2026-10-25',
      night,
      new Date(2026, 10, 1),
    );
    expect(w.longestSleep).toEqual({ minutes: 780, day: '2026-10-24', night: true });
    expect(w.sleepPerDay).toEqual({ total: 780, day: 0, night: 780 });
  });
});
