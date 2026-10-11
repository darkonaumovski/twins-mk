import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '@/components/Confirm';
import { useLive, useStore } from '@/data/StoreContext';
import type { DataStore } from '@/data/repository';
import type { Routine, TwinSlot } from '@/data/types';
import { useFormatAgo } from '@/lib/useNow';
import { useBabies, useTwinName } from '@/features/twins/twins';
import { medCheck, toMedLogs, type MedLog } from './logic';

/** How far back medicine doses are looked up (long enough for weekly medicines). */
const MED_LOOKBACK_MS = 30 * 24 * 3600_000;

async function loadMedData(s: DataStore): Promise<{ routines: Routine[]; logs: MedLog[] }> {
  const now = Date.now();
  const [routines, entries] = await Promise.all([
    s.routines.list(),
    s.logs.listBetween(new Date(now - MED_LOOKBACK_MS).toISOString(), new Date(now + 60_000).toISOString()),
  ]);
  return { routines, logs: toMedLogs(entries) };
}

/** Medicine routines and recent doses, kept live. */
export function useMedData() {
  return useLive(loadMedData, []);
}

/**
 * Checks a dose before it is logged. When a twin had this medicine sooner than
 * the minimum interval the parents set on a medicine routine, asks
 * "Ana already had Vitamin D 2 h ago. Log anyway?". Without such an interval it never asks.
 * Resolves true when logging should go ahead.
 */
export function useMedGuard(): (slots: readonly TwinSlot[], medName: string) => Promise<boolean> {
  const { t } = useTranslation();
  const store = useStore();
  const confirm = useConfirm();
  const ago = useFormatAgo();
  const name = useTwinName(useBabies());

  return useCallback(
    async (slots, medName) => {
      const now = new Date();
      const { routines, logs } = await loadMedData(store);
      const warnings = slots
        .map((slot) => ({ slot, check: medCheck(logs, slot, medName, routines, now) }))
        .filter((w) => w.check.warn && w.check.lastAt);
      if (warnings.length === 0) return true;
      const title = warnings
        .map((w) => t('med.already', { name: name(w.slot), med: medName.trim(), when: ago(w.check.lastAt!, now) }))
        .join(' ');
      const hours = Math.max(...warnings.map((w) => w.check.minIntervalHours ?? 0));
      return confirm({ title, body: t('med.intervalNote', { hours }), confirmLabel: t('med.logAnyway') });
    },
    [store, confirm, t, ago, name],
  );
}
