import { describe, expect, it } from 'vitest';
import en from './locales/en';
import mk from './locales/mk';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'string' ? { ...acc, [key]: v } : { ...acc, ...flatten(v, key) };
  }, {});
}

const locales = { en: flatten(en), mk: flatten(mk) };
const PLURAL = /_(zero|one|two|few|many|other)$/;

describe('translations', () => {
  it('have the same keys in every language', () => {
    expect(Object.keys(locales.mk).sort()).toEqual(Object.keys(locales.en).sort());
  });

  it('have no empty strings', () => {
    for (const [lang, strings] of Object.entries(locales)) {
      for (const [key, value] of Object.entries(strings)) {
        expect(value.trim(), `${lang}:${key}`).not.toBe('');
      }
    }
  });

  it('cover every plural form each language needs', () => {
    for (const [lang, strings] of Object.entries(locales)) {
      const needed = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
      const bases = new Set(
        Object.keys(strings)
          .filter((k) => PLURAL.test(k))
          .map((k) => k.replace(PLURAL, '')),
      );
      for (const base of bases) {
        for (const form of needed) expect(strings, `${lang}:${base}_${form}`).toHaveProperty([`${base}_${form}`]);
      }
    }
  });

  it('use the same interpolation variables in every language', () => {
    const vars = (s: string) => [...s.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();
    for (const [key, value] of Object.entries(locales.en)) {
      if (PLURAL.test(key)) continue;
      expect(vars(locales.mk[key]), key).toEqual(vars(value));
    }
  });
});
