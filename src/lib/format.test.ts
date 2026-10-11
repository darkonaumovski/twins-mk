import { describe, expect, it } from 'vitest';
import { formatAmountInput, safeUrl } from './format';

describe('safeUrl', () => {
  it('allows http(s) and adds https to bare domains', () => {
    expect(safeUrl('https://shop.mk/x')).toBe('https://shop.mk/x');
    expect(safeUrl('shop.mk/x')).toBe('https://shop.mk/x');
    expect(safeUrl('  ')).toBeNull();
  });

  it('rejects other schemes', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,hi')).toBeNull();
  });
});

describe('formatAmountInput', () => {
  it('uses the language decimal separator without grouping', () => {
    expect(formatAmountInput(1234.5, 'mk')).toBe('1234,5');
    expect(formatAmountInput(1234.5, 'en')).toBe('1234.5');
    expect(formatAmountInput(null, 'en')).toBe('');
  });
});
