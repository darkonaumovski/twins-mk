import { describe, expect, it } from 'vitest';
import { countdown, dateOfWeek, pregnancyProgress } from './pregnancy';

describe('pregnancyProgress', () => {
  it('is week 40+0 on the due date', () => {
    expect(pregnancyProgress('2027-01-20', new Date(2027, 0, 20, 15))).toEqual({ daysLeft: 0, week: 40, day: 0 });
  });

  it('counts weeks and days before the due date', () => {
    // 100 days before due = 180 days elapsed = 25+5
    expect(pregnancyProgress('2027-01-20', new Date(2026, 9, 12))).toEqual({ daysLeft: 100, week: 25, day: 5 });
  });

  it('goes negative after the due date', () => {
    expect(pregnancyProgress('2027-01-20', new Date(2027, 0, 23))).toEqual({ daysLeft: -3, week: 40, day: 3 });
  });
});

describe('dateOfWeek', () => {
  it('maps a pregnancy week to its start date', () => {
    expect(dateOfWeek('2027-01-20', 40)).toBe('2027-01-20');
    expect(dateOfWeek('2027-01-20', 36)).toBe('2026-12-23');
  });
});

describe('countdown', () => {
  const today = new Date(2026, 9, 12);

  it('counts to the due date when no delivery date is planned', () => {
    expect(countdown('2027-01-20', null, today)).toEqual({ target: 'due', daysLeft: 100, progress: { daysLeft: 100, week: 25, day: 5 } });
  });

  it('counts to the planned delivery but keeps the week from the due date', () => {
    const c = countdown('2027-01-20', '2027-01-01', today)!;
    expect(c.target).toBe('delivery');
    expect(c.daysLeft).toBe(81);
    expect(c.progress).toEqual({ daysLeft: 100, week: 25, day: 5 });
  });

  it('works with only a planned delivery date, or with neither', () => {
    expect(countdown(null, '2026-10-15', today)).toEqual({ target: 'delivery', daysLeft: 3, progress: null });
    expect(countdown(null, null, today)).toBeNull();
  });
});
