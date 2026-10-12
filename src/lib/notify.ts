export type NotifySupport = 'granted' | 'denied' | 'default' | 'unsupported';

export function notifySupport(): NotifySupport {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestNotifyPermission(): Promise<NotifySupport> {
  if (notifySupport() === 'unsupported') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * Shows a system notification. Android Chrome only allows notifications from a
 * service worker, so prefer the registration when there is one (added with the
 * PWA in M7) and fall back to the page-level constructor elsewhere.
 */
export async function showNotification(title: string, body: string, tag: string, url?: string): Promise<boolean> {
  if (notifySupport() !== 'granted') return false;
  const icon = `${import.meta.env.BASE_URL}icon.svg`;
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      // `url` is opened when the notification is tapped (see the service worker).
      await registration.showNotification(title, { body, tag, icon, data: url ? { url } : undefined });
      return true;
    }
    new Notification(title, { body, tag, icon });
    return true;
  } catch {
    return false;
  }
}
