import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Capability } from './capabilities';
import { useAuth } from './useAuth';
import LoadingScreen from '../../layouts/LoadingScreen';

export function ProtectedRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export function CapabilityRoute({ capability }: { capability: Capability }) {
  const { session, loading, can } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  if (!can(capability)) return <Navigate to="/map" replace />;
  return <Outlet />;
}
