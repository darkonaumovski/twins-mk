import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv';

describe('csv', () => {
  it('leaves plain cells alone', () => {
    expect(csvCell('Ема')).toBe('Ема');
    expect(csvCell(90)).toBe('90');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(true)).toBe('true');
  });

  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('she said "hi"')).toBe('"she said ""hi"""');
    expect(csvCell('line 1\nline 2')).toBe('"line 1\nline 2"');
    expect(csvCell('cr\r\nlf')).toBe('"cr\r\nlf"');
  });

  it('writes numbers with a decimal point and no separators', () => {
    expect(csvCell(37.8)).toBe('37.8');
    expect(csvCell(12345.5)).toBe('12345.5');
    expect(csvCell(0.1 + 0.2)).toBe('0.3');
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(1e21)).toBe('1000000000000000000000');
    expect(csvCell(Number.NaN)).toBe('');
  });

  it('adds a byte order mark and CRLF line ends', () => {
    const text = toCsv([
      ['Датум', 'Белешка'],
      ['2026-10-12', 'спие, "мирно"'],
    ]);
    expect(text).toBe('\uFEFFДатум,Белешка\r\n2026-10-12,"спие, ""мирно"""\r\n');
  });

  it('writes a header-only file for an empty collection', () => {
    expect(toCsv([['a', 'b']])).toBe('\uFEFFa,b\r\n');
  });
});
