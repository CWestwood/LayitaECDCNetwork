// src/App.tsx

import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './features/auth/useAuth';

import LoadingScreen from "./layouts/LoadingScreen";

// ─── Page imports ─────────────────────────────────────────────────────────────
import DashboardPage     from './pages/DashboardPage';
import ECDCMapPage       from './pages/ECDCMapPage';
import LoginPage         from './pages/LoginPage';
import OutreachVisitsPage from './pages/OutreachVisitsPage';
import PractitionersPage  from './pages/PractitionersPage';
import AuditPage         from './pages/AuditPage';
import MonitorPage       from './pages/MonitorPage';
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

function AdminRoute() {
  const { session, loading, isAdmin } = useAuth();

  if (loading) return <LoadingScreen />;                             
  if (!session || !isAdmin) return <Navigate to="/map" replace />;
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


        {/* Admin-only routes */}
          <Route element={<AdminRoute />}>
            <Route path="/audit"        element={<AuditPage />} />
            <Route path="/kobo-monitor"      element={<MonitorPage />} />
            <Route path="/users" element={<StaffManagement />} />
            <Route path="/deleted" element={<DeletedRecords />} />
          </Route>
        </Route>

        {/* Fallback — redirect unknown paths to /dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />

      </Routes>
    </BrowserRouter>
  );
}