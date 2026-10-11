import { describe, expect, it } from 'vitest';
import { colorsClash, DEFAULT_COLORS, TWIN_COLORS } from './twins';

describe('colorsClash', () => {
  it('never allows the same colour twice', () => {
    for (const c of TWIN_COLORS) expect(colorsClash(c, c)).toBe(true);
  });

  it('allows the defaults and is symmetric', () => {
    expect(colorsClash(DEFAULT_COLORS.A, DEFAULT_COLORS.B)).toBe(false);
    expect(colorsClash('blue', 'violet')).toBe(true);
    expect(colorsClash('violet', 'blue')).toBe(true);
  });

  it('leaves every colour at least two partners', () => {
    for (const c of TWIN_COLORS) {
      expect(TWIN_COLORS.filter((o) => !colorsClash(c, o)).length, c).toBeGreaterThanOrEqual(2);
    }
  });
});
