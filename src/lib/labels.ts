import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/** Seeded records show their translation until the user renames them. */
export function useLabel(): (record: { name: string; seedKey: string | null }) => string {
  const { t, i18n } = useTranslation();
  return useCallback(
    (record) => {
      if (record.seedKey && i18n.exists(record.seedKey)) return (t as unknown as (key: string) => string)(record.seedKey);
      return record.name;
    },
    [t, i18n, i18n.language],
  );
}
