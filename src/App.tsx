import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { PreferenceSync } from '@/components/PreferenceSync';
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
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/checklist" element={<ComingSoon titleKey="nav.checklist" milestone={2} />} />
          <Route path="/budget" element={<ComingSoon titleKey="nav.budget" milestone={3} />} />
          <Route path="/shopping" element={<ComingSoon titleKey="nav.shopping" milestone={3} />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/checklist" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
