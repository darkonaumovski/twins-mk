import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { openDexieStore } from './data/dexieStore';
import { StoreProvider } from './data/StoreContext';
import { initI18n } from './i18n';
import { seedChecklistIfNeeded } from './features/checklist/seed';
import en from './i18n/locales/en';
import mk from './i18n/locales/mk';

const root = createRoot(document.getElementById('root')!);

async function start() {
  const store = await openDexieStore();
  await seedChecklistIfNeeded(store);
  await initI18n((await store.device.get()).language);
  root.render(
    <StrictMode>
      <StoreProvider store={store}>
        <App />
      </StoreProvider>
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
