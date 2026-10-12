import { useDevicePrefs, useLive, useStore } from '@/data/StoreContext';
import type { Pump, PumpSide } from '@/data/types';
import { buzz } from '@/lib/device';
import { useLogUI } from '@/features/log/LogUIContext';
import { isRunningPump, runningPump } from './logic';
import { startPump, stopPump } from './pumpActions';

/**
 * The family's pumping timer: the running session (if any; `pumpId` picks one, should two phones have
 * started one each offline), and starting and stopping it.
 */
export function usePumpTimer(pumpId?: string) {
  const store = useStore();
  const prefs = useDevicePrefs();
  const ui = useLogUI();
  const running = useLive(
    async (s) => {
      const pumps = await s.pumps.list();
      return (pumpId ? pumps.find((p) => p.id === pumpId && isRunningPump(p)) : runningPump(pumps)) ?? null;
    },
    [pumpId],
  );

  const start = async (side: PumpSide) => {
    const result = await startPump(store, side, prefs?.parent ?? 'p1', new Date());
    if (result.started) buzz(prefs);
    return result;
  };

  /** Saves the end time at once, then opens the pumping sheet to enter the amounts. */
  const stop = async (pump: Pump) => {
    const stopped = await stopPump(store, pump.id, new Date());
    buzz(prefs);
    if (stopped) ui.pump(stopped);
    else ui.close();
  };

  return { running, start, stop };
}
