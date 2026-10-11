import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ListChecks, Settings, ShoppingCart, Wallet, type LucideIcon } from 'lucide-react';
import { Page } from '@/components/ui';

function MenuGroup({ title, items }: { title?: string; items: { to: string; label: string; icon: LucideIcon }[] }) {
  return (
    <section className="space-y-2">
      {title && <h2 className="px-1 text-sm font-semibold tracking-wide text-muted uppercase">{title}</h2>}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link to={to} className="flex min-h-14 items-center gap-3 px-4 font-medium">
              <Icon aria-hidden size={22} className="text-accent" />
              <span className="flex-1">{label}</span>
              <ChevronRight aria-hidden size={20} className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MorePage() {
  const { t } = useTranslation();
  return (
    <Page title={t('more.title')}>
      <MenuGroup
        title={t('more.preparation')}
        items={[
          { to: '/checklist', label: t('nav.checklist'), icon: ListChecks },
          { to: '/budget', label: t('nav.budget'), icon: Wallet },
          { to: '/shopping', label: t('nav.shopping'), icon: ShoppingCart },
        ]}
      />
      <MenuGroup items={[{ to: '/settings', label: t('nav.settings'), icon: Settings }]} />
    </Page>
  );
}
