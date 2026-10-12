// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { openDexieStore } from '@/data/dexieStore';
import { StoreProvider } from '@/data/StoreContext';
import { SyncEngine } from '@/data/sync/engine';
import { SyncProvider } from '@/data/sync/SyncContext';
import { MemoryServer } from '@/data/sync/memoryRemote';
import { initI18n } from '@/i18n';
import { ActivityRecorder } from '@/features/activity/ActivityRecorder';
import { ChangeNotifier } from './ChangeNotifier';

const engines: SyncEngine[] = [];
let n = 0;

beforeAll(async () => {
  await initI18n('en');
});

afterEach(() => engines.splice(0).forEach((e) => e.stop()));

async function phone(server: MemoryServer, parent: 'p1' | 'p2') {
  const store = await openDexieStore({ name: `notifier-${++n}` });
  await store.device.update({ parent });
  const engine = new SyncEngine(store.sync, async () => server.client(), { debounceMs: 5 });
  engines.push(engine);
  return { store, engine };
}

describe('<ChangeNotifier>', () => {
  it('shows what the other parent logged', async () => {
    const server = new MemoryServer();
    const mom = await phone(server, 'p2');
    const dad = await phone(server, 'p1');
    await mom.store.settings.update({ parent2Name: 'Marija' });
    await dad.store.babies.create({
      id: 'baby-A',
      slot: 'A',
      name: 'Ema',
      color: 'teal',
      birthDateTime: null,
      birthWeightG: null,
      birthLengthCm: null,
    });

    const membership = await mom.engine.createFamily();
    await mom.store.device.update({ sync: membership });
    await dad.store.device.update({ sync: await dad.engine.joinFamily(membership.code) });

    render(
      <StoreProvider store={dad.store}>
        <SyncProvider engine={dad.engine}>
          <MemoryRouter>
            <ToastProvider>
              <ChangeNotifier />
              <ActivityRecorder />
            </ToastProvider>
          </MemoryRouter>
        </SyncProvider>
      </StoreProvider>,
    );
    mom.engine.start(membership);
    // Dad's first download after joining is a merge, not news.
    await waitFor(() => expect(dad.engine.getSnapshot().state).toBe('synced'));
    await mom.engine.syncNow();
    expect(screen.queryByText(/Marija/)).toBeNull();

    await mom.store.logs.createMany([
      {
        type: 'feed',
        data: { method: 'bottle', ml: 90, milk: 'formula' },
        babyId: 'baby-A',
        start: new Date().toISOString(),
        end: null,
        groupId: null,
        loggedBy: 'p2',
      },
    ]);
    expect(await screen.findByText('Marija: Bottle · Ema · 90 ml Formula', {}, { timeout: 3000 })).toBeTruthy();

    // It is also in Dad's notification history, credited to Mom and not seen yet.
    await waitFor(async () => expect(await dad.store.activity.unseenCount()).toBe(1));
    const [entry] = await dad.store.activity.list(1);
    expect(entry).toMatchObject({ collection: 'logs', by: 'p2', mine: false });
  });
});
