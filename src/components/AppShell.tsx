import { Suspense } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, CalendarDays, History, House, ListChecks, Menu, Plus, Settings, ShoppingCart, Wallet, type LucideIcon } from 'lucide-react';
import { useLive, useSettings } from '@/data/StoreContext';
import { useLogUI } from '@/features/log/LogUIContext';
import { cx } from './ui';
import { ErrorBoundary } from './ErrorBoundary';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Unread count shown on the icon. */
  badge?: number;
}

function Tab({ to, label, icon: Icon, badge }: NavItem) {
  const { t } = useTranslation();
  return (
    <li className="min-w-0 flex-1">
      <NavLink
        to={to}
        className={({ isActive }) =>
          cx('flex h-[4.5rem] flex-col items-center justify-center gap-1 text-xs font-medium', isActive ? 'text-accent' : 'text-muted')
        }
      >
        {({ isActive }) => (
          <>
            <span className={cx('relative rounded-full px-4 py-1', isActive && 'bg-accent-soft')}>
              <Icon aria-hidden size={22} strokeWidth={isActive ? 2.4 : 2} />
              {!!badge && (
                <span className="absolute top-0 right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[0.6875rem] leading-none font-bold text-white dark:text-bg">
                  {badge > 99 ? '99+' : badge}
                  <span className="sr-only"> {t('nav.unread', { count: badge })}</span>
                </span>
              )}
            </span>
            <span className="max-w-full truncate px-0.5">{label}</span>
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
  const unread = useLive((s) => s.activity.unseenCount(), []) ?? 0;
  const notifications: NavItem = { to: '/notifications', label: t('nav.notifications'), icon: Bell, badge: unread };

  const prepTabs: NavItem[] = [
    { to: '/checklist', label: t('nav.checklist'), icon: ListChecks },
    { to: '/budget', label: t('nav.budget'), icon: Wallet },
    { to: '/shopping', label: t('nav.shopping'), icon: ShoppingCart },
    notifications,
    { to: '/settings', label: t('nav.settings'), icon: Settings },
  ];
  const plannerLeft: NavItem[] = [
    { to: '/today', label: t('nav.today'), icon: House },
    { to: '/history', label: t('nav.history'), icon: History },
  ];
  const plannerRight: NavItem[] = [
    { to: '/plan', label: t('nav.plan'), icon: CalendarDays },
    notifications,
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
