import { useEffect } from 'react';
import { useDevicePrefs } from '@/data/StoreContext';
import { setLanguage } from '@/i18n';
import { resolveTheme } from '@/lib/theme';
import type { ThemePref } from '@/data/types';

const THEME_KEY = 'twinsmk.theme';
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme(pref: ThemePref) {
  const theme = resolveTheme(pref, new Date(), darkQuery().matches);
  const root = document.documentElement;
  // The night palette builds on the dark one (dark: styles apply), with dimmer, warmer colours.
  root.classList.toggle('dark', theme !== 'light');
  root.classList.toggle('night', theme === 'night');
  // Mirror to localStorage so index.html can apply it before first paint.
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* storage may be unavailable in private mode; the theme still applies */
  }
  const bg = getComputedStyle(root).getPropertyValue('--c-bg').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.removeAttribute('media');
    m.setAttribute('content', bg);
  });
}

/** Keeps the document's theme and language in step with this device's preferences. */
export function PreferenceSync() {
  const prefs = useDevicePrefs();
  const theme = prefs?.theme;
  const language = prefs?.language;

  useEffect(() => {
    if (!theme) return;
    applyTheme(theme);
    const cleanups: (() => void)[] = [];
    if (theme === 'system' || theme === 'autoNight') {
      const mq = darkQuery();
      const onChange = () => applyTheme(theme);
      mq.addEventListener('change', onChange);
      cleanups.push(() => mq.removeEventListener('change', onChange));
    }
    if (theme === 'autoNight') {
      // Switch at 22:00 and 06:00 without a reload; also when the app comes back to the screen.
      const tick = setInterval(() => applyTheme(theme), 60_000);
      const onVisible = () => document.visibilityState === 'visible' && applyTheme(theme);
      document.addEventListener('visibilitychange', onVisible);
      cleanups.push(() => {
        clearInterval(tick);
        document.removeEventListener('visibilitychange', onVisible);
      });
    }
    return () => cleanups.forEach((c) => c());
  }, [theme]);

  useEffect(() => {
    if (language) void setLanguage(language);
  }, [language]);

  return null;
}
