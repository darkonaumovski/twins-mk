import { lazy } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { ConfirmProvider } from '@/components/Confirm';
import { PreferenceSync } from '@/components/PreferenceSync';
import { ToastProvider } from '@/components/Toast';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import { useSettings } from '@/data/StoreContext';
import { ChecklistPage } from '@/features/checklist/ChecklistPage';
import { LogUIProvider } from '@/features/log/LogUIProvider';
import { ReminderSync } from '@/features/plan/ReminderSync';
import { TodayPage } from '@/features/today/TodayPage';

// Less-used screens load on demand (all are precached for offline use).
const BudgetPage = lazy(() => import('@/features/budget/BudgetPage').then((m) => ({ default: m.BudgetPage })));
const ShoppingPage = lazy(() => import('@/features/budget/ShoppingPage').then((m) => ({ default: m.ShoppingPage })));
const GrowthPage = lazy(() => import('@/features/history/GrowthPage').then((m) => ({ default: m.GrowthPage })));
const HistoryPage = lazy(() => import('@/features/history/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const MorePage = lazy(() => import('@/features/more/MorePage').then((m) => ({ default: m.MorePage })));
const DoctorNotesPage = lazy(() => import('@/features/notes/DoctorNotesPage').then((m) => ({ default: m.DoctorNotesPage })));
const PlanPage = lazy(() => import('@/features/plan/PlanPage').then((m) => ({ default: m.PlanPage })));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const SetupPage = lazy(() => import('@/features/twins/SetupPage').then((m) => ({ default: m.SetupPage })));

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
  return (
    <HashRouter>
      <PreferenceSync />
      <ToastProvider>
        <ConfirmProvider>
          <LogUIProvider>
            <ReminderSync />
            <UpdatePrompt />
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<Home />} />
                <Route path="/today" element={<TodayPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/growth" element={<GrowthPage />} />
                <Route path="/plan" element={<PlanPage />} />
                <Route path="/notes" element={<DoctorNotesPage />} />
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
