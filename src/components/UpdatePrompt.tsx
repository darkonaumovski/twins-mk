import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';
import { useToast } from './Toast';

/**
 * Registers the service worker. A new version never reloads on its own (a
 * parent could be halfway through logging); it waits for a tap on "Reload".
 */
export function UpdatePrompt() {
  const { t } = useTranslation();
  const toast = useToast();
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Look for updates every hour while the app stays open.
      if (registration) setInterval(() => void registration.update(), 60 * 60_000);
    },
  });

  useEffect(() => {
    if (!offlineReady) return;
    toast({ message: t('pwa.offlineReady') });
    setOfflineReady(false);
  }, [offlineReady, setOfflineReady, toast, t]);

  if (!needRefresh) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-[max(env(safe-area-inset-top),0.5rem)]">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-ink py-2 pr-2 pl-4 text-bg shadow-lg">
        <span className="flex-1">{t('pwa.updateReady')}</span>
        <button
          type="button"
          onClick={() => void updateServiceWorker(true)}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 font-semibold text-on-accent"
        >
          <RefreshCw aria-hidden size={18} />
          {t('pwa.reload')}
        </button>
      </div>
    </div>
  );
}
