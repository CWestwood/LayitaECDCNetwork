import { supabase } from '../../../auth/supabaseClient';
import type { AppRole } from '../../../auth/capabilities';

export async function fetchStaffManagementData() {
  const [profileResult, staffResult] = await Promise.all([
    supabase.from('profiles').select('*').order('name'),
    supabase.from('layita_staff').select('*').order('name'),
  ]);

  if (profileResult.error) throw new Error(profileResult.error.message);
  if (staffResult.error) throw new Error(staffResult.error.message);
  return { profiles: profileResult.data ?? [], staff: staffResult.data ?? [] };
}

export async function removeStaffManagementItem(type: 'profile' | 'staff', id: string) {
  const result = type === 'profile'
    ? await supabase.from('profiles').delete().eq('id', id)
    : await supabase.from('layita_staff').delete().eq('id', id);
  if (result.error) throw new Error(result.error.message);
}

export async function addStaffManagementItem(type: 'profile' | 'staff', name: string, role: AppRole) {
  const result = type === 'staff'
    ? await supabase.from('layita_staff').insert({ name })
    : await supabase.from('profiles').insert({ id: crypto.randomUUID(), name, role });
  if (result.error) throw new Error(result.error.message);
}
