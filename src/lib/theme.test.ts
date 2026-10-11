import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme';

const at = (h: number) => new Date(2026, 9, 11, h, 30);

describe('resolveTheme', () => {
  it('keeps the fixed choices', () => {
    expect(resolveTheme('light', at(23), true)).toBe('light');
    expect(resolveTheme('dark', at(12), false)).toBe('dark');
    expect(resolveTheme('night', at(12), false)).toBe('night');
  });

  it('follows the phone outside the night hours in "auto night"', () => {
    expect(resolveTheme('autoNight', at(22), false)).toBe('night');
    expect(resolveTheme('autoNight', at(3), false)).toBe('night');
    expect(resolveTheme('autoNight', at(6), false)).toBe('light');
    expect(resolveTheme('autoNight', at(21), true)).toBe('dark');
    expect(resolveTheme('system', at(23), true)).toBe('dark');
  });
});
