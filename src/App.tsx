import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { ConfirmProvider } from '@/components/Confirm';
import { PreferenceSync } from '@/components/PreferenceSync';
import { ToastProvider } from '@/components/Toast';
import { ChecklistPage } from '@/features/checklist/ChecklistPage';
import { ComingSoon } from '@/features/placeholder/ComingSoon';
import { SettingsPage } from '@/features/settings/SettingsPage';

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
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/checklist" element={<ChecklistPage />} />
              <Route path="/budget" element={<ComingSoon titleKey="nav.budget" milestone={3} />} />
              <Route path="/shopping" element={<ComingSoon titleKey="nav.shopping" milestone={3} />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/checklist" replace />} />
            </Route>
          </Routes>
        </ConfirmProvider>
      </ToastProvider>
    </HashRouter>
  );
}
