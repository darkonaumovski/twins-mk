import { useEffect } from 'react';
import type { DevicePrefs } from '@/data/types';

/** A short buzz after something was logged, if the phone can and the user has not turned it off. */
export function buzz(prefs: Pick<DevicePrefs, 'haptics'> | undefined) {
  if (prefs?.haptics === false) return;
  try {
    navigator.vibrate?.(30);
  } catch {
    /* not supported (e.g. iPhone): nothing to do */
  }
}

/**
 * Keeps the screen on while `active` (a timer is running). Browsers drop the lock
 * when the app goes to the background, so it is asked for again when it comes back.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;
    const request = async () => {
      if (stopped || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (stopped) void lock.release();
        else sentinel = lock;
      } catch {
        /* refused (battery saver, not allowed): the screen just turns off as usual */
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void request();
      else if (sentinel && !sentinel.released) void sentinel.release();
    };
    void request();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel && !sentinel.released) void sentinel.release();
    };
  }, [active]);
}
