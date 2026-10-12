/** A cell value; `null` and `undefined` become an empty cell. */
export type CsvCell = string | number | boolean | null | undefined;

const BOM = '\uFEFF';

/** One cell, quoted only when it has to be (RFC 4180): commas, quotes or line breaks. */
export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'number' ? formatNumber(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Plain digits with a decimal point and no thousands separators, whatever the phone's locale. */
function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '';
  // No exponents, no float noise such as 0.30000000000000004, up to 6 decimals.
  return n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 6 });
}

/**
 * A CSV file as text: UTF-8 byte order mark (so Excel reads Cyrillic), `\r\n` line ends,
 * and a trailing line break. `rows[0]` is normally the header.
 */
export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return BOM + rows.map((row) => row.map(csvCell).join(',') + '\r\n').join('');
}
