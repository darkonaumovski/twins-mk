import { createContext, useContext, useEffect, useState, type DependencyList, type ReactNode } from 'react';
import type { DataStore } from './repository';
import type { DevicePrefs, SharedSettings } from './types';

const StoreContext = createContext<DataStore | null>(null);

export function StoreProvider({ store, children }: { store: DataStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): DataStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StoreProvider>');
  return store;
}

/**
 * Subscribes to a live query; re-renders whenever the data it reads changes.
 * Returns `undefined` until the first result arrives.
 */
export function useLive<R>(query: (store: DataStore) => Promise<R>, deps: DependencyList): R | undefined {
  const store = useStore();
  const [value, setValue] = useState<R | undefined>(undefined);

  useEffect(() => {
    const sub = store
      .live(() => query(store))
      .subscribe({
        next: setValue,
        error: (err) => console.error('Live query failed', err),
      });
    return () => sub.unsubscribe();
  }, [store, ...deps]);

  return value;
}

export function useSettings(): SharedSettings | undefined {
  return useLive((s) => s.settings.get(), []);
}

export function useDevicePrefs(): DevicePrefs | undefined {
  return useLive((s) => s.device.get(), []);
}
