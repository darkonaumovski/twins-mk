import { Component, type ReactNode } from 'react';
import i18n from '@/i18n';

/**
 * Reloads, first switching to a waiting new version of the app if there is one.
 * A crash can come from data written by a newer version on the other phone, and
 * a plain reload would keep running the old code.
 */
async function reloadToLatest() {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const waiting = registration?.waiting;
    if (waiting) {
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
      waiting.postMessage({ type: 'SKIP_WAITING' });
      // Fall back to a plain reload if the switch does not happen.
      setTimeout(() => location.reload(), 3000);
      return;
    }
  } catch {
    /* no service worker (development, private mode): just reload */
  }
  location.reload();
}

/** Last line of defence: a crash in one screen shows a calm message instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-md space-y-4 p-6 pt-16 text-center">
        <h1 className="text-xl font-semibold">{i18n.t('error.title')}</h1>
        <p className="text-muted">{i18n.t('error.body')}</p>
        <button
          type="button"
          onClick={() => void reloadToLatest()}
          className="min-h-12 rounded-xl bg-accent px-6 font-semibold text-on-accent"
        >
          {i18n.t('error.reload')}
        </button>
      </div>
    );
  }
}
