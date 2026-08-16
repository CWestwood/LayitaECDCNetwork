// src/App.tsx

import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './features/auth/useAuth';
import type { Capability } from './features/auth/capabilities';

import LoadingScreen from "./layouts/LoadingScreen";

// ─── Page imports ─────────────────────────────────────────────────────────────
import DashboardPage     from './pages/DashboardPage';
import MyWorkPage        from './pages/MyWorkPage';
import ECDCMapPage       from './pages/ECDCMapPage';
import LoginPage         from './pages/LoginPage';
import OutreachVisitsPage from './pages/OutreachVisitsPage';
import OutreachPlanningPage from './pages/OutreachPlanningPage';
import PractitionersPage  from './pages/PractitionersPage';
import AuditPage         from './pages/AuditPage';
import MonitorPage       from './pages/MonitorPage';
import DataQualityPage   from './pages/DataQualityPage';
import StaffManagement   from './pages/StaffManagement';
import DeletedRecords    from './features/layita/deleted';

// ─── ProtectedRoute ───────────────────────────────────────────────────────────
// Renders children when authenticated. Shows a blank loading state while the
// session is being hydrated (avoids a flash-redirect to /login on hard refresh).



function ProtectedRoute() {
  const { session, loading } = useAuth();

  if (loading) return <LoadingScreen />;                          
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function CapabilityRoute({ capability }: { capability: Capability }) {
  const { session, loading, can } = useAuth();

  if (loading) return <LoadingScreen />;                             
  if (!session || !can(capability)) return <Navigate to="/map" replace />;
  return <Outlet />;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Public */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected — all app routes live inside this wrapper */}
        <Route element={<ProtectedRoute />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"   element={<DashboardPage />} />
          <Route path="/map"         element={<ECDCMapPage />} />
          <Route path="/visits"      element={<OutreachVisitsPage />} />
          <Route path="/practitioners" element={<PractitionersPage />} />

          <Route element={<CapabilityRoute capability="manage_own_work" />}>
            <Route path="/my-work" element={<MyWorkPage />} />
          </Route>

          <Route element={<CapabilityRoute capability="view_quality" />}>
            <Route path="/audit"        element={<AuditPage />} />
            <Route path="/data-quality" element={<DataQualityPage />} />
          </Route>

          <Route element={<CapabilityRoute capability="reprocess_kobo" />}>
            <Route path="/kobo-monitor"      element={<MonitorPage />} />
          </Route>

          <Route element={<CapabilityRoute capability="manage_plans" />}>
            <Route path="/outreach-planning" element={<OutreachPlanningPage />} />
          </Route>

          <Route element={<CapabilityRoute capability="manage_users" />}>
            <Route path="/users" element={<StaffManagement />} />
          </Route>

          <Route element={<CapabilityRoute capability="restore_records" />}>
            <Route path="/deleted" element={<DeletedRecords />} />
          </Route>
        </Route>

        {/* Fallback — redirect unknown paths to /dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />

      </Routes>
    </BrowserRouter>
  );
}
