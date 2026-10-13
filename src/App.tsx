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
import { ReminderActionListener } from '@/features/plan/ReminderActionListener';
import { PushSync } from '@/features/plan/PushSettings';
import { ChangeNotifier } from '@/features/sync/ChangeNotifier';
import { ActivityRecorder } from '@/features/activity/ActivityRecorder';
import { LastSeenTracker } from '@/features/family/Handover';
import { TimerWakeLock } from '@/features/log/useLogActions';
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
const StashPage = lazy(() => import('@/features/milk/StashPage').then((m) => ({ default: m.StashPage })));
const SuppliesPage = lazy(() => import('@/features/supplies/SuppliesPage').then((m) => ({ default: m.SuppliesPage })));
const MilestonesPage = lazy(() => import('@/features/milestones/MilestonesPage').then((m) => ({ default: m.MilestonesPage })));
const NotificationsPage = lazy(() => import('@/features/activity/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const ReportPage = lazy(() => import('@/features/report/ReportPage').then((m) => ({ default: m.ReportPage })));
const ContractionsPage = lazy(() => import('@/features/contractions/ContractionsPage').then((m) => ({ default: m.ContractionsPage })));
const VaccinesPage = lazy(() => import('@/features/vaccines/VaccinesPage').then((m) => ({ default: m.VaccinesPage })));
const MotherPage = lazy(() => import('@/features/mother/MotherPage').then((m) => ({ default: m.MotherPage })));
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
            <ReminderActionListener />
            <PushSync />
            <ChangeNotifier />
            <ActivityRecorder />
            <LastSeenTracker />
            <TimerWakeLock />
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
                <Route path="/stash" element={<StashPage />} />
                <Route path="/supplies" element={<SuppliesPage />} />
                <Route path="/report" element={<ReportPage />} />
                <Route path="/milestones" element={<MilestonesPage />} />
                <Route path="/vaccines" element={<VaccinesPage />} />
                <Route path="/mother" element={<MotherPage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/setup" element={<SetupPage />} />
                <Route path="/contractions" element={<ContractionsPage />} />
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
