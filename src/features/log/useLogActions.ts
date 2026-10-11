import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/Toast';
import { useDevicePrefs, useLive, useStore } from '@/data/StoreContext';
import { newId } from '@/lib/ids';
import type { LogEntry } from '@/data/types';
import { useBabies, useTwinName } from '@/features/twins/twins';
import { buildEntries, planSleepToggle, type LogDraft, type Who } from './logic';
import { useLogUI } from './LogUIContext';

const RUNNING_WINDOW_MS = 7 * 24 * 3600_000;

/** Running timers (sleep, breastfeeding) from the last week. */
export function useRunning(): LogEntry[] | undefined {
  return useLive((s) => s.logs.listRunning(new Date(Date.now() - RUNNING_WINDOW_MS).toISOString()), []);
}

/** Creating and stopping entries, each followed by an undo toast. */
export function useLogActions() {
  const { t } = useTranslation();
  const store = useStore();
  const toast = useToast();
  const prefs = useDevicePrefs();
  const babies = useBabies();
  const name = useTwinName(babies);
  const ui = useLogUI();

  const whoLabel = (who: Who) => (who === 'both' ? t('twins.both') : name(who));

  /** Logs one draft for one or both twins. `what` names it in the confirmation toast. */
  const log = async (who: Who, draft: LogDraft, what: string) => {
    const created = await store.logs.createMany(buildEntries(who, draft, prefs?.parent ?? 'p1', newId));
    toast({
      message: t('log.logged', { what, who: whoLabel(who) }),
      action: {
        label: t('common.undo'),
        onClick: () => void store.transaction(async () => Promise.all(created.map((e) => store.logs.remove(e.id)))),
      },
      secondaryAction: { label: t('log.adjust'), onClick: () => ui.edit(created[0]) },
    });
    return created;
  };

  const toggleSleep = async (who: Who, running: readonly LogEntry[]) => {
    const plan = planSleepToggle(who, running);
    if (plan.stop.length > 0) {
      await stopTimers(plan.stop, t('log.endSleep'), who);
      return;
    }
    const now = new Date().toISOString();
    const startWho: Who = plan.start.length === 2 ? 'both' : plan.start[0] === 'baby-B' ? 'B' : 'A';
    await log(startWho, { type: 'sleep', data: {}, start: now, end: null }, t('log.startSleep'));
  };

  const stopTimers = async (entries: readonly LogEntry[], what: string, who: Who) => {
    const end = new Date().toISOString();
    await store.transaction(async () => Promise.all(entries.map((e) => store.logs.update(e.id, { end }))));
    toast({
      message: t('log.logged', { what, who: whoLabel(who) }),
      action: {
        label: t('common.undo'),
        onClick: () => void store.transaction(async () => Promise.all(entries.map((e) => store.logs.update(e.id, { end: null })))),
      },
      secondaryAction: entries.length === 1 ? { label: t('log.adjust'), onClick: () => ui.edit({ ...entries[0], end }) } : undefined,
    });
  };

  return { log, toggleSleep, stopTimers, whoLabel };
}
