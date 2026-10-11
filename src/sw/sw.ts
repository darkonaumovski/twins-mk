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

// Tapping a reminder brings the app to the front (or opens it).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows[0];
      return open ? open.focus() : self.clients.openWindow(self.registration.scope);
    }),
  );
});
