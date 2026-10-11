import { useTranslation } from 'react-i18next';
import { useSettings } from '@/data/StoreContext';
import type { ParentId } from '@/data/types';

/** Display name for a parent: the custom name if set, otherwise "Parent 1/2" in the current language. */
export function useParentName(): (parent: ParentId) => string {
  const { t } = useTranslation();
  const settings = useSettings();
  return (parent) => {
    const custom = parent === 'p1' ? settings?.parent1Name : settings?.parent2Name;
    return custom || t(`parents.${parent}`);
  };
}
