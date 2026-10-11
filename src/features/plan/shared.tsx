import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Segmented } from '@/components/ui';
import type { BabyScope, LogType } from '@/data/types';
import { colorOf, TwinBadge, useBabies, useTwinName } from '@/features/twins/twins';
import { slotsFor } from './logic';

/** "Лена", "Двајцата" or "Семејство" for a planner record's scope. */
export function useScopeLabel(): (scope: BabyScope) => string {
  const { t } = useTranslation();
  const babies = useBabies();
  const name = useTwinName(babies);
  return useCallback((scope) => (scope === 'both' ? t('twins.both') : scope === 'none' ? t('plan.family') : name(scope)), [t, name]);
}

export function ScopePicker({
  value,
  onChange,
  allowFamily = true,
}: {
  value: BabyScope;
  onChange: (v: BabyScope) => void;
  allowFamily?: boolean;
}) {
  const { t } = useTranslation();
  const label = useScopeLabel();
  const options: BabyScope[] = allowFamily ? ['A', 'B', 'both', 'none'] : ['A', 'B', 'both'];
  return (
    <Segmented label={t('plan.for')} value={value} options={options.map((o) => ({ value: o, label: label(o) }))} onChange={onChange} />
  );
}

/** Small twin badges for a scope; nothing for family-wide items. */
export function ScopeBadges({ scope }: { scope: BabyScope }) {
  const babies = useBabies();
  const slots = slotsFor(scope);
  if (slots.length === 0) return null;
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
      })[type],
    [t],
  );
}
