import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/components/AppShell';
import { ComingSoon } from '@/components/ComingSoon';
import { ConfirmProvider } from '@/components/Confirm';
import { PreferenceSync } from '@/components/PreferenceSync';
import { ToastProvider } from '@/components/Toast';
import { useSettings } from '@/data/StoreContext';
import { BudgetPage } from '@/features/budget/BudgetPage';
import { ShoppingPage } from '@/features/budget/ShoppingPage';
import { ChecklistPage } from '@/features/checklist/ChecklistPage';
import { LogUIProvider } from '@/features/log/LogUIProvider';
import { MorePage } from '@/features/more/MorePage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { TodayPage } from '@/features/today/TodayPage';
import { SetupPage } from '@/features/twins/SetupPage';

/** Home is the checklist before birth and Today after. */
function Home() {
  const settings = useSettings();
  if (!settings) return null;
  return <Navigate to={settings.phase === 'planner' ? '/today' : '/checklist'} replace />;
}

/**
 * Hash-based routing (`/#/settings`) works on GitHub Pages and offline
 * without any server-side rewrite rules.
 */
export function App() {
  const { t } = useTranslation();
  return (
    <HashRouter>
      <PreferenceSync />
      <ToastProvider>
        <ConfirmProvider>
          <LogUIProvider>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<Home />} />
                <Route path="/today" element={<TodayPage />} />
                <Route path="/history" element={<ComingSoon title={t('nav.history')} milestone={5} />} />
                <Route path="/plan" element={<ComingSoon title={t('nav.plan')} milestone={6} />} />
                <Route path="/more" element={<MorePage />} />
                <Route path="/setup" element={<SetupPage />} />
                <Route path="/checklist" element={<ChecklistPage />} />
                <Route path="/budget" element={<BudgetPage />} />
                <Route path="/shopping" element={<ShoppingPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Home />} />
              </Route>
            </Routes>
          </LogUIProvider>
        </ConfirmProvider>
      </ToastProvider>
    </HashRouter>
  );
}
