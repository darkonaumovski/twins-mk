/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { openDexieStore } from '@/data/dexieStore';
import type { ReminderActionData } from '@/features/plan/reminderActions';
import { handleReminderAction, handleSync, SYNC_TAG, type SwLike } from './reminderAction';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

// The whole app (HTML, JS, CSS, icons) is precached, so it works fully offline.
// Data lives in IndexedDB; sync requests (if turned on) go straight to the network.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// A new version waits until the user taps "Reload" so nobody loses a half-filled form.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// A push reminder from the sync server (also while the app is closed).
self.addEventListener('push', (event) => {
  let message: {
    title?: string;
    body?: string;
    tag?: string;
    url?: string;
    actions?: { action: string; title: string }[];
    data?: ReminderActionData;
    renotify?: boolean;
  } = {};
  try {
    message = event.data?.json() ?? {};
  } catch {
    message = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(message.title || 'Twins Organizer', {
      body: message.body ?? '',
      // The same tag replaces an earlier notification instead of stacking up.
      tag: message.tag,
      icon: new URL('pwa-192x192.png', self.registration.scope).href,
      badge: new URL('pwa-64x64.png', self.registration.scope).href,
      data: { url: message.url, reminder: message.data },
      // "Done" and "Snooze 15 min" (Android; iPhone shows the notification without them).
      ...(message.actions?.length ? { actions: message.actions } : {}),
      // A snoozed reminder replaces the first one (same tag), but still sounds.
      ...(message.renotify && message.tag ? { renotify: true } : {}),
    } as NotificationOptions),
  );
});

/** Background Sync is not in TypeScript's worker types yet. */
const sw = self as unknown as SwLike;

// One store for the notification buttons, opened only when a button is pressed with the app closed.
let store: ReturnType<typeof openDexieStore> | null = null;
// A failed open (blocked, out of space) is not kept: the next button press tries again.
const openStore = () =>
  (store ??= openDexieStore().catch((error: unknown) => {
    store = null;
    throw error;
  }));

// Tapping a reminder brings the app to the front (or opens it), on Today for push reminders.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data as { url?: string; reminder?: unknown } | undefined;
  if (event.action) {
    // A button: do it without opening the app.
    event.waitUntil(handleReminderAction(sw, event.action, data?.reminder, { openStore, now: () => new Date() }).catch(() => undefined));
    return;
  }
  const path = data?.url;
  const url = path ? new URL(path, self.registration.scope).href : self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const open = windows[0];
      if (!open) return self.clients.openWindow(url);
      if (path && 'navigate' in open) await open.navigate(url).catch(() => undefined);
      return open.focus();
    }),
  );
});

// Background Sync (where available) after a button was pressed with the app closed.
self.addEventListener('sync', (event) => {
  const sync = event as Event & { tag?: string; waitUntil(promise: Promise<unknown>): void };
  if (sync.tag === SYNC_TAG) sync.waitUntil(handleSync(sw));
});
