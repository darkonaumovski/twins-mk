import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { openDexieStore } from './data/dexieStore';
import { StoreProvider } from './data/StoreContext';
import { initI18n } from './i18n';
import { seedChecklistIfNeeded } from './features/checklist/seed';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ensurePersistentStorage } from './lib/storage';
import { SyncEngine } from './data/sync/engine';
import { SyncProvider } from './data/sync/SyncContext';
import { syncConnector } from './data/sync/config';
import { LockGate } from './features/lock/LockGate';
// Starts listening for the browser's install prompt as early as possible.
import './lib/install';
import en from './i18n/locales/en';
import mk from './i18n/locales/mk';

const root = createRoot(document.getElementById('root')!);

async function start() {
  const store = await openDexieStore();
  await seedChecklistIfNeeded(store);
  await initI18n((await store.device.get()).language);
  // Ask the browser not to evict our data (silently granted to installed apps on most phones).
  void ensurePersistentStorage();
  const sync = new SyncEngine(store.sync, syncConnector());
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <StoreProvider store={store}>
          <SyncProvider engine={sync}>
            <LockGate>
              <App />
            </LockGate>
          </SyncProvider>
        </StoreProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

start().catch((err) => {
  console.error(err);
  // i18n may not be ready, so show both languages.
  const p = document.createElement('p');
  p.style.cssText = 'padding:1.5rem;max-width:32rem;margin:auto';
  p.textContent = `${mk.app.loadError} / ${en.app.loadError}`;
  document.getElementById('root')!.replaceChildren(p);
});
