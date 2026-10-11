import { useTranslation } from 'react-i18next';
import { Page } from '@/components/ui';

/** Temporary screen for features scheduled in a later milestone. */
export function ComingSoon({ titleKey, milestone }: { titleKey: 'nav.checklist' | 'nav.budget' | 'nav.shopping'; milestone: number }) {
  const { t } = useTranslation();
  return (
    <Page title={t(titleKey)}>
      <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">
        {t('common.comingSoon', { m: milestone })}
      </p>
    </Page>
  );
}
