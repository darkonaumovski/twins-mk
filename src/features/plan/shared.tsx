import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Segmented } from '@/components/ui';
import type { BabyScope, LogType, TwinSlot } from '@/data/types';
import { colorOf, TwinBadge, useBabies, useTwinName } from '@/features/twins/twins';
import { scopeLabelKey, slotsFor, type ScopeKind } from './logic';

/** "Лена", "Двајцата", or for `none` "Бременост / мајка", "За мајката" or "Семејство", depending on the kind of record. */
export function useScopeLabel(kind: ScopeKind = 'routine'): (scope: BabyScope) => string {
  const { t } = useTranslation();
  const babies = useBabies();
  const name = useTwinName(babies);
  return useCallback(
    (scope) => {
      const key = scopeLabelKey(scope, kind);
      return key ? t(key) : name(scope as TwinSlot);
    },
    [t, name, kind],
  );
}

export function ScopePicker({
  value,
  onChange,
  allowFamily = true,
  kind = 'routine',
}: {
  value: BabyScope;
  onChange: (v: BabyScope) => void;
  allowFamily?: boolean;
  kind?: ScopeKind;
}) {
  const { t } = useTranslation();
  const label = useScopeLabel(kind);
  const options: BabyScope[] = allowFamily ? ['A', 'B', 'both', 'none'] : ['A', 'B', 'both'];
  return (
    <Segmented label={t('plan.for')} value={value} options={options.map((o) => ({ value: o, label: label(o) }))} onChange={onChange} />
  );
}

/**
 * Small twin badges for a scope. For `none` nothing on routines (family-wide), and a small
 * "Pregnancy / mother" or "For the mother" label on appointments and notes.
 */
export function ScopeBadges({ scope, kind = 'routine' }: { scope: BabyScope; kind?: ScopeKind }) {
  const babies = useBabies();
  const label = useScopeLabel(kind);
  const slots = slotsFor(scope);
  if (slots.length === 0) {
    if (kind === 'routine') return null;
    return <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-ink">{label(scope)}</span>;
  }
  return (
    <span className="inline-flex shrink-0 -space-x-1">
      {slots.map((slot) => (
        <TwinBadge key={slot} slot={slot} color={colorOf(babies, slot)} size="sm" />
      ))}
    </span>
  );
}

export function useLogTypeName(): (type: LogType) => string {
  const { t } = useTranslation();
  return useCallback(
    (type) =>
      ({
        feed: t('log.feed'),
        diaper: t('log.diaper'),
        sleep: t('log.sleep'),
        med: t('log.med'),
        measure: t('log.measure'),
        note: t('log.note'),
        temp: t('log.temp'),
        spitup: t('log.spitup'),
        bath: t('log.bath'),
        tummy: t('log.tummy'),
      })[type],
    [t],
  );
}
