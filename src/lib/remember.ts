import { useState } from 'react';

/**
 * A small per-phone preference kept in localStorage (e.g. the last bottle amount).
 * Falls back to `initial` when storage is unavailable or the saved value is not allowed.
 */
export function useRemembered<T extends string | number>(key: string, initial: T, isValid: (v: unknown) => v is T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initial;
      const parsed: unknown = typeof initial === 'number' ? Number(raw) : raw;
      return isValid(parsed) ? parsed : initial;
    } catch {
      return initial;
    }
  });
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, String(v));
    } catch {
      /* not critical */
    }
  };
  return [value, set];
}

export const oneOf =
  <T extends string>(...allowed: T[]) =>
  (v: unknown): v is T =>
    allowed.includes(v as T);

export const positiveInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 10_000;
