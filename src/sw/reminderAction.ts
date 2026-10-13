/**
 * "Done" and "Snooze 15 min" on a push reminder, handled by the service worker. Kept apart from
 * sw.ts so it can be tested with a fake `self`. With an app window open, the page does the write
 * (through its own store and sync); otherwise the service worker writes through the same store code,
 * so the outbox picks it up and sync uploads it when the app next opens (or sooner, via Background Sync).
 */
import type { DataStore } from '@/data/repository';
import { applyReminderAction, isReminderActionData, type ReminderAction } from '@/features/plan/reminderActions';

export const REMINDER_ACTION_MESSAGE = 'REMINDER_ACTION';
export const SYNC_NOW_MESSAGE = 'SYNC_NOW';
export const SYNC_TAG = 'twins-sync';

/** The parts of the service worker global this needs. */
export interface SwLike {
  clients: {
    matchAll(options: {
      type: 'window';
      includeUncontrolled: boolean;
    }): Promise<readonly { postMessage(message: unknown, transfer?: Transferable[]): void }[]>;
  };
  registration: { sync?: { register(tag: string): Promise<void> } };
}

export type ActionResult = 'posted' | 'written' | 'ignored';

/** How long an open window has to confirm it saved the action before the service worker saves it itself. */
export const ACK_TIMEOUT_MS = 2000;

/** Posts to a window and waits for "saved"; false if it says otherwise or does not answer in time (still loading, stuck). */
function postAndWait(target: { postMessage(message: unknown, transfer?: Transferable[]): void }, message: unknown, timeoutMs: number) {
  return new Promise<boolean>((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(false);
    }, timeoutMs);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve((event.data as { ok?: boolean } | null)?.ok === true);
    };
    target.postMessage(message, [channel.port2]);
  });
}

export async function handleReminderAction(
  sw: SwLike,
  action: string,
  data: unknown,
  deps: {
    openStore: () => Promise<Pick<DataStore, 'device'> & Parameters<typeof applyReminderAction>[0]>;
    now: () => Date;
    ackTimeoutMs?: number;
  },
): Promise<ActionResult> {
  if ((action !== 'done' && action !== 'snooze') || !isReminderActionData(data)) return 'ignored';
  const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
  // The open app writes it, so its screens and sync see it at once. If it does not confirm, the service
  // worker writes it too (the fixed ids make a second write harmless).
  if (
    windows.length > 0 &&
    (await postAndWait(windows[0], { type: REMINDER_ACTION_MESSAGE, action, data }, deps.ackTimeoutMs ?? ACK_TIMEOUT_MS))
  ) {
    return 'posted';
  }
  const store = await deps.openStore();
  const { parent } = await store.device.get();
  await applyReminderAction(store, action as ReminderAction, data, deps.now(), parent);
  // Upload sooner where the browser offers Background Sync (Android Chrome); otherwise on the next open.
  await sw.registration.sync?.register(SYNC_TAG).catch(() => undefined);
  return 'written';
}

/** Background Sync fired: an open window (if any) syncs now; without one, the next open does. */
export async function handleSync(sw: SwLike): Promise<void> {
  const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const w of windows) w.postMessage({ type: SYNC_NOW_MESSAGE });
}
