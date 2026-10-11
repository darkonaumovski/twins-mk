/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

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
  let message: { title?: string; body?: string; tag?: string; url?: string } = {};
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
      data: { url: message.url },
    }),
  );
});

// Tapping a reminder brings the app to the front (or opens it), on Today for push reminders.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data as { url?: string } | undefined)?.url;
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
