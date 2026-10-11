import { base64UrlDecode, base64UrlEncode } from '@/server/webpush';

/** The server's public VAPID key, set at build time (see the README). Push is off without it. */
export const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? '';

/**
 * - `unsupported`: this browser has no Web Push, or the build has no key.
 * - `installFirst`: iPhone/iPad Safari: only an app added to the Home Screen can receive push.
 * - `denied`: notifications are blocked for this site.
 */
export type PushSupport = 'ok' | 'unsupported' | 'installFirst' | 'denied';

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || !VAPID_PUBLIC_KEY) return 'unsupported';
  if (isIos() && !isStandalone()) return 'installFirst';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

export interface PushKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

function keysOf(sub: PushSubscription): PushKeys {
  const key = (name: PushEncryptionKeyName) => {
    const raw = sub.getKey(name);
    return raw ? base64UrlEncode(new Uint8Array(raw)) : '';
  };
  return { endpoint: sub.endpoint, p256dh: key('p256dh'), auth: key('auth') };
}

/** Asks for permission (call from a tap) and subscribes this phone. Returns null if refused. */
export async function subscribePush(): Promise<PushKeys | null> {
  if ((await Notification.requestPermission()) !== 'granted') return null;
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const sub =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlDecode(VAPID_PUBLIC_KEY).slice().buffer as ArrayBuffer,
    }));
  return keysOf(sub);
}

/** This phone's current subscription, if any (it can change or disappear without the app noticing). */
export async function currentPush(): Promise<PushKeys | null> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const sub = await registration?.pushManager.getSubscription();
    return sub ? keysOf(sub) : null;
  } catch {
    return null;
  }
}

export async function unsubscribePush(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    await (await registration?.pushManager.getSubscription())?.unsubscribe();
  } catch {
    /* already gone */
  }
}
