import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, BellRing } from 'lucide-react';
import { Button } from '@/components/Button';
import { Section, Toggle } from '@/components/ui';
import { useDevicePrefs, useStore } from '@/data/StoreContext';
import { notifySupport, requestNotifyPermission, showNotification, type NotifySupport } from '@/lib/notify';

export function RemindersSettings() {
  const { t } = useTranslation();
  const store = useStore();
  const prefs = useDevicePrefs();
  const [support, setSupport] = useState<NotifySupport>(notifySupport);
  if (!prefs) return null;

  const toggle = async (on: boolean) => {
    if (!on) {
      await store.device.update({ notifications: false });
      return;
    }
    const result = support === 'granted' ? 'granted' : await requestNotifyPermission();
    setSupport(result);
    await store.device.update({ notifications: result === 'granted' });
  };

  return (
    <Section title={t('reminders.title')}>
      {support === 'unsupported' ? (
        <p className="text-muted">{t('reminders.unsupported')}</p>
      ) : (
        <div>
          <Toggle label={t('reminders.enable')} checked={prefs.notifications && support === 'granted'} onChange={toggle} />
          <p className="text-sm text-muted">{t('reminders.hint')}</p>
        </div>
      )}
      {support === 'denied' && <p className="text-sm font-medium text-danger">{t('reminders.denied')}</p>}
      <p className="flex gap-2 text-sm">
        <AlertTriangle aria-hidden size={16} className="mt-0.5 shrink-0 text-warn" />
        <span>{t('reminders.limits')}</span>
      </p>
      {prefs.notifications && support === 'granted' && (
        <Button variant="secondary" onClick={() => showNotification(t('app.name'), t('reminders.testBody'), 'test')}>
          <BellRing aria-hidden size={18} />
          {t('reminders.test')}
        </Button>
      )}
    </Section>
  );
}
