import { describe, expect, it } from 'vitest';
import { barPath, linear, niceTicks } from './scale';

describe('niceTicks', () => {
  it('produces round ticks covering the data', () => {
    expect(niceTicks(0, 540)).toEqual([0, 200, 400, 600]);
    expect(niceTicks(0, 9)).toEqual([0, 5, 10]);
    expect(niceTicks(45, 46)).toEqual([45, 45.5, 46]);
    expect(niceTicks(2400, 3100)).toEqual([2400, 2600, 2800, 3000, 3200]);
  });

  it('handles empty and flat data', () => {
    expect(niceTicks(0, 0)[0]).toBe(0);
    expect(niceTicks(0, 0).length).toBeGreaterThan(1);
    const flat = niceTicks(2450, 2450);
    expect(flat[0]).toBeLessThanOrEqual(2450);
    expect(flat.at(-1)).toBeGreaterThanOrEqual(2450);
  });
});

describe('linear', () => {
  it('maps domain to range, including inverted ranges for SVG y', () => {
    const y = linear(0, 100, 150, 10);
    expect(y(0)).toBe(150);
    expect(y(100)).toBe(10);
    expect(y(50)).toBe(80);
  });
});

describe('barPath', () => {
  it('is empty for zero-height bars', () => {
    expect(barPath(0, 100, 10, 100)).toBe('');
  });

  it('starts and ends on the baseline', () => {
    const d = barPath(10, 40, 12, 100);
    expect(d.startsWith('M10,100')).toBe(true);
    expect(d.endsWith('V100Z')).toBe(true);
  });
});
