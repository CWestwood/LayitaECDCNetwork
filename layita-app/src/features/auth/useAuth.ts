// src/features/auth/useAuth.ts
// ─── Minimal auth hook — listens to Supabase session changes ─────────────────

import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { hasCapability, normalizeRole } from './capabilities';
import type { AppRole, Capability } from './capabilities';

interface AuthState {
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  role: AppRole | null;
  can: (capability: Capability) => boolean;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState<AppRole | null>(null);
  

  useEffect(() => {
    let isMounted = true;

    const fetchRole = async (userId: string) => {
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();
      if (isMounted) {
        const nextRole = normalizeRole(data?.role);
        setRole(nextRole);
        setIsAdmin(nextRole === 'administrator');
      }
    };
    // Hydrate from existing session on mount
    supabase.auth.getSession().then(async ({ data }) => {
      if (isMounted) setSession(data.session);
      if (data.session?.user) {
        await fetchRole(data.session.user.id);
      }
      if (isMounted) setLoading(false);
    });

    // Keep in sync with sign-in / sign-out events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session?.user) {
        setRole(null);
        setIsAdmin(false);
      } else {
        fetchRole(session.user.id);
      }
    });

    

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    loading,
    isAdmin,
    role,
    can: (capability) => hasCapability(role, capability),
  };
}
