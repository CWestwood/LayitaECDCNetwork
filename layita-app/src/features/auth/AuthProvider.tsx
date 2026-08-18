import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { hasCapability, normalizeRole } from './capabilities';
import type { AppRole } from './capabilities';
import { AuthContext } from './auth-context';
import type { AuthProfile } from './auth-context';

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const requestId = useRef(0);

  const hydrate = useCallback(async (nextSession: Session | null) => {
    const currentRequest = ++requestId.current;
    setSession(nextSession);
    setError(null);
    if (!nextSession) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, role, layita_staff_id, is_active')
      .eq('id', nextSession.user.id)
      .maybeSingle();

    if (currentRequest !== requestId.current) return;
    if (profileError) {
      setProfile(null);
      setError(new Error(`Profile could not be loaded: ${profileError.message}`));
    } else if (!data || data.is_active === false) {
      setSession(null);
      setProfile(null);
      setError(new Error(data ? 'This account has been deactivated.' : 'No application profile is linked to this account.'));
    } else {
      setProfile({
        id: data.id,
        name: data.name,
        role: normalizeRole(data.role),
        layitaStaffId: data.layita_staff_id,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setError(new Error(`Session could not be loaded: ${sessionError.message}`));
        setLoading(false);
        return;
      }
      void hydrate(data.session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) void hydrate(nextSession);
    });

    return () => {
      active = false;
      requestId.current += 1;
      subscription.unsubscribe();
    };
  }, [hydrate]);

  const role: AppRole | null = profile?.role ?? null;
  const value = useMemo(() => ({
    session,
    profile,
    loading,
    error,
    role,
    isAdmin: role === 'administrator',
    can: (capability: Parameters<typeof hasCapability>[1]) => hasCapability(role, capability),
    signOut: async () => {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw new Error(`Sign out failed: ${signOutError.message}`);
    },
  }), [error, loading, profile, role, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
