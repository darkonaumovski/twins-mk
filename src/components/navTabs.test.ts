import { describe, expect, it } from 'vitest';
import { navTabs } from './navTabs';

describe('bottom navigation', () => {
  it('has Plan before the birth, with at most five tabs', () => {
    const prep = navTabs('prep');
    expect(prep.left).toEqual(['checklist', 'plan', 'budget', 'notifications', 'settings']);
    expect(prep.right).toEqual([]);
    expect(prep.logButton).toBe(false);
  });

  it('keeps the daily tabs and the log button after the birth', () => {
    const planner = navTabs('planner');
    expect([...planner.left, ...planner.right]).toEqual(['today', 'history', 'plan', 'notifications', 'more']);
    expect(planner.logButton).toBe(true);
  });

  it('never shows more than five tabs', () => {
    for (const phase of ['prep', 'planner'] as const) {
      const { left, right } = navTabs(phase);
      expect(left.length + right.length).toBeLessThanOrEqual(5);
    }
  });
});
