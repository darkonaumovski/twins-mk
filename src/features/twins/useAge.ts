import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Baby, TwinSlot } from '@/data/types';
import { ageInfo, weeksAndDays } from './age';
import type { Babies } from './twins';

/** "3 weeks 2 days", "5 days" or "4 weeks". */
export function useFormatAgeDays(): (days: number) => string {
  const { t } = useTranslation();
  return useCallback(
    (total) => {
      const { weeks, days } = weeksAndDays(total);
      const w = t('age.weeks', { count: weeks });
      const d = t('age.days', { count: days });
      if (weeks === 0) return d;
      return days === 0 ? w : t('age.weeksDays', { weeks: w, days: d });
    },
    [t],
  );
}

/** The age line for a twin: "Age 3 weeks 2 days · corrected 1 week" (the corrected part only for preterm babies). */
export function useAgeText(): (baby: Baby | undefined, now: Date) => string | null {
  const { t } = useTranslation();
  const fmt = useFormatAgeDays();
  return useCallback(
    (baby, now) => {
      const info = baby ? ageInfo(baby, now) : null;
      if (!info) return null;
      const actual = t('age.actual', { age: fmt(info.actualDays) });
      if (info.correctedDays === null) return actual;
      const corrected =
        info.correctedDays >= 0
          ? t('age.corrected', { age: fmt(info.correctedDays) })
          : t('age.correctedBefore', { age: fmt(info.correctedDays) });
      return `${actual} · ${corrected}`;
    },
    [t, fmt],
  );
}

/** Twins currently in hospital. */
export function awaySlots(babies: Babies | undefined): TwinSlot[] {
  return (['A', 'B'] as const).filter((slot) => babies?.[slot]?.location === 'hospital');
}
