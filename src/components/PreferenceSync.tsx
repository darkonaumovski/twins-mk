import { useEffect } from 'react';
import { useDevicePrefs } from '@/data/StoreContext';
import { setLanguage } from '@/i18n';
import type { ThemePref } from '@/data/types';

const THEME_KEY = 'twinsmk.theme';
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && darkQuery().matches);
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
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
    if (theme !== 'system') return;
    const mq = darkQuery();
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  useEffect(() => {
    if (language) void setLanguage(language);
  }, [language]);

  return null;
}
