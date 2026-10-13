import { describe, expect, it, vi } from 'vitest';
import { openDexieStore } from '@/data/dexieStore';
import { handleReminderAction, handleSync, REMINDER_ACTION_MESSAGE, SYNC_NOW_MESSAGE, SYNC_TAG, type SwLike } from './reminderAction';

const occurrence = '2026-10-11T07:00:00.000Z';
const data = (routineId: string) => ({
  kind: 'routines',
  routineId,
  occurrence,
  babies: 'A',
  med: false,
  key: `routine:${routineId}:A:${occurrence}`,
  title: 'Bath',
});

/**
 * A fake service worker global: some open windows, and Background Sync or not. `answer` is what a window
 * replies on the message's port (`'none'`: a window still loading, which never answers).
 */
function fakeSelf(windows: number, withSync = true, answer: 'ok' | 'failed' | 'none' = 'ok') {
  const posted: unknown[] = [];
  const register = vi.fn(async (_tag: string) => {});
  const postMessage = (m: unknown, transfer?: Transferable[]) => {
    posted.push(m);
    const port = transfer?.[0] as MessagePort | undefined;
    if (answer !== 'none') port?.postMessage({ ok: answer === 'ok' });
  };
  const sw: SwLike = {
    clients: { matchAll: async () => Array.from({ length: windows }, () => ({ postMessage })) },
    registration: withSync ? { sync: { register } } : {},
  };
  return { sw, posted, register };
}

let n = 0;

describe('notification buttons in the service worker', () => {
  it('hands the action to an open app window, which writes it and confirms', async () => {
    const { sw, posted, register } = fakeSelf(2);
    const openStore = vi.fn();
    expect(await handleReminderAction(sw, 'done', data('r1'), { openStore, now: () => new Date() })).toBe('posted');
    expect(posted).toEqual([{ type: REMINDER_ACTION_MESSAGE, action: 'done', data: data('r1') }]);
    expect(openStore).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it('writes it itself when the window does not confirm (still loading) or could not save it', async () => {
    for (const answer of ['none', 'failed'] as const) {
      const store = await openDexieStore({ name: `sw-action-${++n}` });
      const { sw, posted } = fakeSelf(1, true, answer);
      const result = await handleReminderAction(sw, 'done', data('r1'), {
        openStore: async () => store,
        now: () => new Date(),
        ackTimeoutMs: 20,
      });
      expect(result).toBe('written');
      expect(posted).toHaveLength(1);
      expect(await store.routineDone.list()).toHaveLength(1);
    }
  });

  it('writes through the store when the app is closed, then asks for a Background Sync', async () => {
    const store = await openDexieStore({ name: `sw-action-${++n}` });
    const { sw, register } = fakeSelf(0);
    const now = new Date('2026-10-11T07:05:00.000Z');
    expect(await handleReminderAction(sw, 'done', data('r1'), { openStore: async () => store, now: () => now })).toBe('written');
    expect((await store.routineDone.list()).map((d) => [d.routineId, d.occurrence])).toEqual([['r1', occurrence]]);
    // Through the normal store, so it is waiting in the outbox for the next sync.
    expect((await store.sync.pending()).some((e) => e.collection === 'routineDone')).toBe(true);
    expect(register).toHaveBeenCalledWith(SYNC_TAG);
  });

  it('still writes on a browser without Background Sync', async () => {
    const store = await openDexieStore({ name: `sw-action-${++n}` });
    const { sw } = fakeSelf(0, false);
    expect(await handleReminderAction(sw, 'snooze', data('r2'), { openStore: async () => store, now: () => new Date() })).toBe('written');
    expect(await store.reminderSnoozes.list()).toHaveLength(1);
  });

  it('ignores unknown buttons and incomplete data', async () => {
    const { sw, posted } = fakeSelf(1);
    const openStore = vi.fn();
    expect(await handleReminderAction(sw, 'open', data('r1'), { openStore, now: () => new Date() })).toBe('ignored');
    expect(await handleReminderAction(sw, 'done', { routineId: 'x' }, { openStore, now: () => new Date() })).toBe('ignored');
    expect(posted).toEqual([]);
    expect(openStore).not.toHaveBeenCalled();
  });

  it('asks open windows to sync when Background Sync fires', async () => {
    const { sw, posted } = fakeSelf(1);
    await handleSync(sw);
    expect(posted).toEqual([{ type: SYNC_NOW_MESSAGE }]);
  });
});
