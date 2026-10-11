import { useTranslation } from 'react-i18next';
import { Page } from './ui';

/** Temporary screen for features scheduled in a later milestone. */
export function ComingSoon({ title, milestone }: { title: string; milestone: number }) {
  const { t } = useTranslation();
  return (
    <Page title={title}>
      <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">{t('common.comingSoon', { m: milestone })}</p>
    </Page>
  );
}
