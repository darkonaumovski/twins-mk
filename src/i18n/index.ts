import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { enUS, mk as mkDateLocale, type Locale } from 'date-fns/locale';
import en from './locales/en';
import mk from './locales/mk';
import type { Language } from '@/data/types';

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'mk', label: 'Македонски' },
  { code: 'en', label: 'English' },
];

export async function initI18n(language: Language) {
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, mk: { translation: mk } },
    lng: language,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  document.documentElement.lang = language;
  return i18n;
}

export function setLanguage(language: Language) {
  document.documentElement.lang = language;
  return i18n.changeLanguage(language);
}

const DATE_LOCALES: Record<Language, Locale> = { en: enUS, mk: mkDateLocale };

export function dateLocale(language: string): Locale {
  return DATE_LOCALES[language as Language] ?? enUS;
}

export default i18n;
