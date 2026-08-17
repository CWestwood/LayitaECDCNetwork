import { createContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { AppRole, Capability } from './capabilities';

export interface AuthProfile {
  id: string;
  name: string | null;
  role: AppRole | null;
  layitaStaffId: string | null;
}

export interface AuthState {
  session: Session | null;
  profile: AuthProfile | null;
  loading: boolean;
  error: Error | null;
  isAdmin: boolean;
  role: AppRole | null;
  can: (capability: Capability) => boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);
