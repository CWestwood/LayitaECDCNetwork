import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { Capability } from './features/auth/capabilities';
import { CapabilityRoute, ProtectedRoute } from './features/auth/RouteGuards';
import AppShell from './layouts/AppShell';
import LoadingScreen from './layouts/LoadingScreen';
import { ROUTE_ACCESS } from './routes/routeAccess';

const Dashboard = lazy(() => import('./features/dashboard'));
const MyWork = lazy(() => import('./features/layita/my-work'));
const EcdcMap = lazy(() => import('./features/ecdcs'));
const Login = lazy(() => import('./features/auth/Login'));
const OutreachVisits = lazy(() => import('./features/visits'));
const OutreachPlanning = lazy(() => import('./features/visits/OutreachPlanning'));
const Training = lazy(() => import('./features/training'));
const Practitioners = lazy(() => import('./features/practitioners'));
const QualityAuditShell = lazy(() => import('./features/layita/QualityAuditShell'));
const Audit = lazy(() => import('./features/layita/audit'));
const Monitor = lazy(() => import('./features/layita/monitoring'));
const DataQuality = lazy(() => import('./features/layita/data-quality'));
const StaffManagement = lazy(() => import('./features/layita/users/StaffManagement'));
const DeletedRecords = lazy(() => import('./features/layita/deleted'));

function capabilityRoute(capability: Capability, path: string, element: ReactNode) {
  return (
    <Route key={path} element={<CapabilityRoute capability={capability} />}>
      <Route path={path} element={element} />
    </Route>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/map" element={<EcdcMap />} />
              <Route path="/visits" element={<OutreachVisits />} />
              <Route path="/practitioners" element={<Practitioners />} />
              {capabilityRoute(ROUTE_ACCESS.myWork.capability, ROUTE_ACCESS.myWork.path, <MyWork />)}
              {capabilityRoute(ROUTE_ACCESS.planning.capability, ROUTE_ACCESS.planning.path, <OutreachPlanning />)}
              {capabilityRoute(ROUTE_ACCESS.training.capability, ROUTE_ACCESS.training.path, <Training />)}
              {capabilityRoute(ROUTE_ACCESS.users.capability, ROUTE_ACCESS.users.path, <StaffManagement />)}
              {capabilityRoute(ROUTE_ACCESS.deleted.capability, ROUTE_ACCESS.deleted.path, <DeletedRecords />)}
              <Route element={<CapabilityRoute capability={ROUTE_ACCESS.quality.capability} />}>
                <Route element={<QualityAuditShell />}>
                  <Route path={ROUTE_ACCESS.quality.path} element={<DataQuality />} />
                  <Route path={ROUTE_ACCESS.audit.path} element={<Audit />} />
                  <Route element={<CapabilityRoute capability={ROUTE_ACCESS.koboMonitor.capability} />}>
                    <Route path={ROUTE_ACCESS.koboMonitor.path} element={<Monitor />} />
                  </Route>
                </Route>
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
