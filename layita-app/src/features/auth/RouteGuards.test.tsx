import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { AuthContext } from './auth-context';
import type { AuthState } from './auth-context';
import { CapabilityRoute, ProtectedRoute } from './RouteGuards';
import { hasCapability } from './capabilities';
import type { AppRole } from './capabilities';

function authState(role: AppRole | null, authenticated = true): AuthState {
  return {
    session: authenticated ? ({ user: { id: 'fixture-user' } } as unknown as Session) : null,
    profile: role ? { id: 'fixture-user', name: 'Fixture', role, layitaStaffId: null } : null,
    loading: false,
    error: null,
    isAdmin: role === 'administrator',
    role,
    can: (capability) => hasCapability(role, capability),
    signOut: async () => undefined,
  };
}

function renderRoutes(state: AuthState) {
  render(
    <AuthContext.Provider value={state}>
      <MemoryRouter initialEntries={['/quality']}>
        <Routes>
          <Route path="/login" element={<div>Login screen</div>} />
          <Route path="/map" element={<div>Map screen</div>} />
          <Route element={<ProtectedRoute />}>
            <Route element={<CapabilityRoute capability="view_quality" />}>
              <Route path="/quality" element={<div>Quality screen</div>} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('route guard smoke', () => {
  it('sends unauthenticated users to login', () => {
    renderRoutes(authState(null, false));
    expect(screen.getByText('Login screen')).toBeInTheDocument();
  });

  it('allows a manager into quality workflows', () => {
    renderRoutes(authState('manager'));
    expect(screen.getByText('Quality screen')).toBeInTheDocument();
  });

  it('sends a library user to the safe map route', () => {
    renderRoutes(authState('library'));
    expect(screen.getByText('Map screen')).toBeInTheDocument();
  });
});
