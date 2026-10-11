import { describe, expect, it } from 'vitest';
import { formatAmountInput, formatMoney, safeUrl } from './format';

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

describe('formatMoney', () => {
  it('formats Macedonian with dot grouping and the currency after the number', () => {
    expect(formatMoney(46150, 'MKD', 'mk')).toBe('46.150 ден.');
    expect(formatMoney(1234.5, 'EUR', 'mk')).toBe('1.234,50 €');
    expect(formatMoney(10, 'CHF', 'mk')).toBe('10 CHF');
  });

  it('formats English with the currency symbol', () => {
    expect(formatMoney(1234.5, 'EUR', 'en')).toBe('€1,234.50');
    expect(formatMoney(46150, 'MKD', 'en')).toMatch(/^MKD\s46,150$/); // Intl uses a non-breaking space
  });
});

describe('formatAmountInput', () => {
  it('uses the language decimal separator without grouping', () => {
    expect(formatAmountInput(1234.5, 'mk')).toBe('1234,5');
    expect(formatAmountInput(1234.5, 'en')).toBe('1234.5');
    expect(formatAmountInput(null, 'en')).toBe('');
  });
});
