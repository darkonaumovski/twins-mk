import { useTranslation } from 'react-i18next';
import { CheckCircle2, MonitorSmartphone } from 'lucide-react';
import { Button } from '@/components/Button';
import { Section } from '@/components/ui';
import { isIos, useInstallPrompt } from '@/lib/install';

export function InstallSettings() {
  const { t } = useTranslation();
  const { install, installed } = useInstallPrompt();

  return (
    <Section title={t('install.title')}>
      {installed ? (
        <p className="flex items-center gap-2 font-medium text-ok">
          <CheckCircle2 aria-hidden size={20} />
          {t('install.installed')}
        </p>
      ) : (
        <>
          <p className="text-sm">{t('install.why')}</p>
          {install && (
            <Button className="w-full" onClick={install}>
              <MonitorSmartphone aria-hidden size={18} />
              {t('install.button')}
            </Button>
          )}
          <p className="text-sm text-muted">{isIos() ? t('install.hintIos') : t('install.hintAndroid')}</p>
        </>
      )}
    </Section>
  );
}
