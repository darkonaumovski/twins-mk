import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { useDevicePrefs } from '../StoreContext';
import type { SyncEngine, SyncSnapshot } from './engine';

const SyncContext = createContext<SyncEngine | null>(null);

/** Provides the sync engine and runs it whenever this phone belongs to a family. */
export function SyncProvider({ engine, children }: { engine: SyncEngine; children: ReactNode }) {
  const prefs = useDevicePrefs();
  const familyId = prefs?.sync?.familyId;
  const code = prefs?.sync?.code;

  useEffect(() => {
    if (!familyId || !code) {
      engine.stop();
      return;
    }
    engine.start({ familyId, code });
  }, [engine, familyId, code]);

  return <SyncContext.Provider value={engine}>{children}</SyncContext.Provider>;
}

export function useSyncEngine(): SyncEngine {
  const engine = useContext(SyncContext);
  if (!engine) throw new Error('useSyncEngine must be used inside <SyncProvider>');
  return engine;
}

const OFF: SyncSnapshot = { state: 'off', error: null, pending: 0, live: false, lastSyncAt: null };
const noop = () => () => {};
const getOff = () => OFF;

/** The engine's state; 'off' outside a SyncProvider (e.g. in component tests). */
export function useSyncStatus(): SyncSnapshot {
  const engine = useContext(SyncContext);
  return useSyncExternalStore(engine?.subscribe ?? noop, engine?.getSnapshot ?? getOff);
}
