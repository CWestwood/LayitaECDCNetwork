import { supabase } from '../../../auth/supabaseClient';
import type { AppRole } from '../../../auth/capabilities';

export interface ManagedUser {
  id: string; email: string | null; name: string | null; role: AppRole;
  layita_staff_id: string | null; is_active: boolean; deactivated_at: string | null;
  last_sign_in_at: string | null; invited_at: string | null;
}
export interface ManagedStaff { id: string; name: string | null; role: string | null; is_active: boolean; deactivated_at: string | null; }
interface AdminUsersResponse { users?: ManagedUser[]; staff?: ManagedStaff[]; success?: boolean; error?: string; }
export type AdminUserAction =
  | { action: 'list' }
  | { action: 'invite'; email: string; name: string; role: AppRole; layita_staff_id: string | null }
  | { action: 'update'; user_id: string; name: string; role: AppRole; layita_staff_id: string | null }
  | { action: 'deactivate' | 'reactivate' | 'reset'; user_id: string };

export async function runAdminUserAction(body: AdminUserAction): Promise<AdminUsersResponse> {
  const { data, error } = await supabase.functions.invoke<AdminUsersResponse>('admin-users', { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data ?? {};
}

export async function fetchStaffManagementData() {
  const data = await runAdminUserAction({ action: 'list' });
  return { users: data.users ?? [], staff: data.staff ?? [] };
}
