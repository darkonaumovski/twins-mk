import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ListChecks, Settings, ShoppingCart, Wallet, type LucideIcon } from 'lucide-react';
import { cx } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export function AppShell() {
  const { t } = useTranslation();
  const items: NavItem[] = [
    { to: '/checklist', label: t('nav.checklist'), icon: ListChecks },
    { to: '/budget', label: t('nav.budget'), icon: Wallet },
    { to: '/shopping', label: t('nav.shopping'), icon: ShoppingCart },
    { to: '/settings', label: t('nav.settings'), icon: Settings },
  ];

  return (
    <div className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      <main>
        <Outlet />
      </main>
      <nav
        aria-label={t('nav.main')}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto flex max-w-2xl">
          {items.map(({ to, label, icon: Icon }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cx(
                    'flex h-[4.5rem] flex-col items-center justify-center gap-1 text-xs font-medium',
                    isActive ? 'text-accent' : 'text-muted',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={cx('rounded-full px-4 py-1', isActive && 'bg-accent-soft')}>
                      <Icon aria-hidden size={22} strokeWidth={isActive ? 2.4 : 2} />
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
