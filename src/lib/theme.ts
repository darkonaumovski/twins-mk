import type { ThemePref } from '@/data/types';

export type ResolvedTheme = 'light' | 'dark' | 'night';

/** "Auto night" uses the very dim night palette from 22:00 to 06:00. */
export const NIGHT_FROM_HOUR = 22;
export const NIGHT_TO_HOUR = 6;

export function isNightHour(now: Date): boolean {
  const h = now.getHours();
  return h >= NIGHT_FROM_HOUR || h < NIGHT_TO_HOUR;
}

/** The palette to show for a preference at a given moment. */
export function resolveTheme(pref: ThemePref, now: Date, systemDark: boolean): ResolvedTheme {
  if (pref === 'night') return 'night';
  if (pref === 'autoNight' && isNightHour(now)) return 'night';
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  return systemDark ? 'dark' : 'light';
}
