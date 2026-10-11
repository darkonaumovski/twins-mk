import { format, parseISO } from 'date-fns';
import { dateLocale } from '@/i18n';
import type { ISODate } from '@/data/types';

export function todayISO(now = new Date()): ISODate {
  return format(now, 'yyyy-MM-dd');
}

/** Short date such as "23 Dec" / "23 дек.". */
export function formatShortDate(date: ISODate, language: string): string {
  return format(parseISO(date), 'd MMM', { locale: dateLocale(language) });
}

/** Long date such as "23 December 2026". */
export function formatLongDate(date: ISODate, language: string): string {
  return format(parseISO(date), 'PPP', { locale: dateLocale(language) });
}

const MK_SYMBOLS: Record<string, string> = { MKD: 'ден.', EUR: '€', USD: '$', GBP: '£' };

/**
 * Macedonian is formatted by hand ("46.150 ден.", "1.234,50 €") because some
 * browsers ship without Macedonian number data and would fall back to "MKD 46,150".
 * German uses the same separators and is available everywhere.
 */
export function formatMoney(amount: number, currency: string, language: string): string {
  const digits = { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 };
  if (language === 'mk') {
    return `${amount.toLocaleString('de-DE', digits)} ${MK_SYMBOLS[currency] ?? currency}`;
  }
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, ...digits }).format(amount);
  } catch {
    return `${amount.toLocaleString('en-GB', digits)} ${currency}`;
  }
}

/** Plain number for editable price fields, using the language's decimal separator. */
export function formatAmountInput(amount: number | null, language: string): string {
  if (amount === null) return '';
  return amount.toLocaleString(language === 'mk' ? 'de-DE' : 'en-GB', { useGrouping: false, maximumFractionDigits: 2 });
}

/** Only http(s) links may be opened; a bare domain gets https:// in front. */
export function safeUrl(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null;
  return `https://${s}`;
}
