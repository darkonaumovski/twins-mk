import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/data/StoreContext';
import type { BabyScope } from '@/data/types';

/**
 * The scope for a new appointment or note: before the birth the mother's ('none'), after it both
 * twins. The settings load a moment after the sheet opens, so the default follows them until the
 * parent picks something. An existing record keeps its own scope.
 */
export function usePhaseScope(existing: BabyScope | undefined): [BabyScope, (v: BabyScope) => void] {
  const settings = useSettings();
  const [scope, setScope] = useState<BabyScope>(existing ?? 'both');
  const touched = useRef(existing !== undefined);
  const phase = settings?.phase;
  useEffect(() => {
    if (!touched.current && phase) setScope(phase === 'prep' ? 'none' : 'both');
  }, [phase]);
  return [
    scope,
    (v) => {
      touched.current = true;
      setScope(v);
    },
  ];
}
