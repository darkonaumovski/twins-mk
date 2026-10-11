import { Suspense } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, History, House, ListChecks, Menu, Plus, Settings, ShoppingCart, Wallet, type LucideIcon } from 'lucide-react';
import { useSettings } from '@/data/StoreContext';
import { useLogUI } from '@/features/log/LogUIContext';
import { cx } from './ui';
import { ErrorBoundary } from './ErrorBoundary';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

function Tab({ to, label, icon: Icon }: NavItem) {
  return (
    <li className="flex-1">
      <NavLink
        to={to}
        className={({ isActive }) =>
          cx('flex h-[4.5rem] flex-col items-center justify-center gap-1 text-xs font-medium', isActive ? 'text-accent' : 'text-muted')
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
  );
}

export function AppShell() {
  const { t } = useTranslation();
  const settings = useSettings();
  const ui = useLogUI();
  const planner = settings?.phase === 'planner';
  const location = useLocation();

  const prepTabs: NavItem[] = [
    { to: '/checklist', label: t('nav.checklist'), icon: ListChecks },
    { to: '/budget', label: t('nav.budget'), icon: Wallet },
    { to: '/shopping', label: t('nav.shopping'), icon: ShoppingCart },
    { to: '/settings', label: t('nav.settings'), icon: Settings },
  ];
  const plannerLeft: NavItem[] = [
    { to: '/today', label: t('nav.today'), icon: House },
    { to: '/history', label: t('nav.history'), icon: History },
  ];
  const plannerRight: NavItem[] = [
    { to: '/plan', label: t('nav.plan'), icon: CalendarDays },
    { to: '/more', label: t('nav.more'), icon: Menu },
  ];

  return (
    <div className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom))] print:pb-0">
      <main id="main">
        {/* Keyed by route, so a crash on one screen clears when you navigate away. */}
        <ErrorBoundary key={location.pathname}>
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <nav
        aria-label={t('nav.main')}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur print:hidden"
      >
        <ul className="mx-auto flex max-w-2xl">
          {settings && !planner && prepTabs.map((item) => <Tab key={item.to} {...item} />)}
          {planner && (
            <>
              {plannerLeft.map((item) => (
                <Tab key={item.to} {...item} />
              ))}
              <li className="flex flex-1 items-center justify-center">
                <button
                  type="button"
                  onClick={ui.quick}
                  aria-label={t('nav.log')}
                  className="-mt-6 flex size-16 items-center justify-center rounded-full bg-accent text-on-accent shadow-lg ring-4 ring-bg hover:brightness-110"
                >
                  <Plus aria-hidden size={32} strokeWidth={2.5} />
                </button>
              </li>
              {plannerRight.map((item) => (
                <Tab key={item.to} {...item} />
              ))}
            </>
          )}
        </ul>
      </nav>
    </div>
  );
}
