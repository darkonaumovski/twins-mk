import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLive } from '@/data/StoreContext';
import type { Caregiver, CaregiverId, SharedSettings } from '@/data/types';

/** The two parents have fixed ids; their names live in the shared settings. */
export const PARENT_IDS = ['p1', 'p2'] as const;
/** Parents and helpers together. */
export const MAX_CAREGIVERS = 8;

export interface CaregiverInfo {
  id: CaregiverId;
  /** The name to show (a default such as "Parent 1" when none was entered). */
  name: string;
  isParent: boolean;
}

/** Parents first, then helpers in their order. Deleted helpers are left out. */
export function caregiverList(
  settings: Pick<SharedSettings, 'parent1Name' | 'parent2Name'> | undefined,
  helpers: readonly Caregiver[],
  defaults: { p1: string; p2: string; helper: string },
): CaregiverInfo[] {
  const parents: CaregiverInfo[] = [
    { id: 'p1', name: settings?.parent1Name || defaults.p1, isParent: true },
    { id: 'p2', name: settings?.parent2Name || defaults.p2, isParent: true },
  ];
  const rest = helpers
    .filter((h) => h.deletedAt === null)
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt))
    .map((h) => ({ id: h.id, name: h.name.trim() || defaults.helper, isParent: false }));
  return [...parents, ...rest];
}

/** Everyone who can log or take on tasks, kept live. */
export function useCaregivers(): CaregiverInfo[] | undefined {
  const { t } = useTranslation();
  const data = useLive(async (s) => ({ settings: await s.settings.get(), helpers: await s.caregivers.listAll() }), []);
  if (!data) return undefined;
  return caregiverList(data.settings, data.helpers, { p1: t('parents.p1'), p2: t('parents.p2'), helper: t('caregivers.helper') });
}

/** Display name for anyone who logged something, including helpers that were removed since. */
export function useCaregiverName(): (id: CaregiverId) => string {
  const { t } = useTranslation();
  const data = useLive(async (s) => ({ settings: await s.settings.get(), helpers: await s.caregivers.listAll() }), []);
  return useCallback(
    (id) => {
      if (id === 'p1') return data?.settings.parent1Name || t('parents.p1');
      if (id === 'p2') return data?.settings.parent2Name || t('parents.p2');
      const helper = data?.helpers.find((h) => h.id === id);
      return helper?.name.trim() || t('caregivers.helper');
    },
    [data, t],
  );
}
