import { describe, expect, it } from 'vitest';
import { visibleValues } from './LineChart';

describe('reference line values in view', () => {
  const line = [
    { t: 0, v: 10 },
    { t: 30, v: 20 },
    { t: 60, v: 40 },
  ];

  it('adds where the line crosses both edges, so the value axis fits it', () => {
    expect(visibleValues(line, 15, 45).sort((a, b) => a - b)).toEqual([15, 20, 30]);
  });

  it('starts at the first point when the view begins before the line', () => {
    expect(visibleValues(line, -31, 30).sort((a, b) => a - b)).toEqual([10, 10, 20, 20]);
  });

  it('gives nothing past the end of the line', () => {
    expect(visibleValues(line, 70, 90)).toEqual([]);
  });
});
