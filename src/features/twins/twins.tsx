import { useCallback, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/components/ui';
import { useLive } from '@/data/StoreContext';
import type { Baby, TwinColor, TwinSlot } from '@/data/types';
import { BABY_IDS, slotOf } from '@/features/log/logic';

export const TWIN_COLORS: readonly TwinColor[] = ['teal', 'amber', 'violet', 'rose', 'blue', 'green'];
export const DEFAULT_COLORS: Record<TwinSlot, TwinColor> = { A: 'teal', B: 'amber' };

export interface Babies {
  A: Baby | undefined;
  B: Baby | undefined;
  /** True once both twins have been set up. */
  ready: boolean;
}

export function useBabies(): Babies | undefined {
  return useLive(async (s) => {
    const [A, B] = await Promise.all([s.babies.get(BABY_IDS.A), s.babies.get(BABY_IDS.B)]);
    return { A, B, ready: Boolean(A && B) };
  }, []);
}

export function colorOf(babies: Babies | undefined, slot: TwinSlot): TwinColor {
  return babies?.[slot]?.color ?? DEFAULT_COLORS[slot];
}

/** CSS custom properties for one twin: --tw (fill), --tw-ink (text on surfaces), --tw-soft (tinted background). */
export function twinStyle(color: TwinColor): CSSProperties {
  return {
    '--tw': `var(--twin-${color})`,
    '--tw-ink': `var(--twin-${color}-ink)`,
    '--tw-soft': `var(--twin-${color}-soft)`,
  } as CSSProperties;
}

/** Display names, falling back to "Twin A/B" in the current language. */
export function useTwinName(babies: Babies | undefined): (slotOrBabyId: TwinSlot | string) => string {
  const { t } = useTranslation();
  return useCallback(
    (key) => {
      const slot: TwinSlot = key === 'A' || key === 'B' ? key : slotOf(key);
      return babies?.[slot]?.name || (slot === 'A' ? t('twins.twinA') : t('twins.twinB'));
    },
    [babies, t],
  );
}

/**
 * The twin's letter on its colour. Colour is never the only cue: the letter
 * (A/B, А/Б) always identifies the twin. Dark text passes 4.5:1 on every fill.
 */
export function TwinBadge({ slot, color, size = 'md' }: { slot: TwinSlot; color: TwinColor; size?: 'sm' | 'md' | 'lg' }) {
  const { t } = useTranslation();
  return (
    <span
      aria-hidden
      style={twinStyle(color)}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-(--tw) font-bold text-[#1b1410]',
        size === 'sm' && 'size-6 text-xs',
        size === 'md' && 'size-8 text-sm',
        size === 'lg' && 'size-10 text-base',
      )}
    >
      {slot === 'A' ? t('twins.letterA') : t('twins.letterB')}
    </span>
  );
}
