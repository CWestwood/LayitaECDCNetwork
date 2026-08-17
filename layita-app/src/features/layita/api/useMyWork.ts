import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '../../auth/supabaseClient';

export interface MyPlannedVisit {
  id: string;
  scheduled_date: string;
  practitioner_name: string;
  outreach_type: string;
  status: string;
  notes: string | null;
}

export interface MyRecentVisit {
  id: string;
  date: string | null;
  outreach_type: string | null;
  outreach_happened: string | null;
  source: string | null;
  practitioners?: { name: string | null } | null;
}

export interface MyWorkData {
  staffName: string | null;
  plannedVisits: MyPlannedVisit[];
  recentVisits: MyRecentVisit[];
}

export function useMyWork() {
  return useQuery<MyWorkData>({
    queryKey: ['my-work'],
    queryFn: async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw new Error(userError.message);

      const userId = userData.user?.id;
      if (!userId) {
        return { staffName: null, plannedVisits: [], recentVisits: [] };
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('name, layita_staff_id')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) throw new Error(profileError.message);
      if (!profile?.layita_staff_id) {
        return { staffName: null, plannedVisits: [], recentVisits: [] };
      }

      const { data: staff, error: staffError } = await supabase
        .from('layita_staff')
        .select('id, name')
        .eq('id', profile.layita_staff_id)
        .maybeSingle();

      if (staffError) throw new Error(staffError.message);
      if (!staff?.id) {
        return { staffName: profile?.name ?? null, plannedVisits: [], recentVisits: [] };
      }

      const [plannedResult, recentResult] = await Promise.all([
        supabase
          .from('planned_visits')
          .select('id, scheduled_date, practitioner_name, outreach_type, status, notes')
          .eq('assigned_to', staff.id)
          .eq('status', 'planned')
          .order('scheduled_date', { ascending: true })
          .limit(12),
        supabase
          .from('outreach_visits')
          .select('id, date, outreach_type, outreach_happened, source, practitioners!outreach_visits_practitioner_id_fkey(name)')
          .eq('data_capturer_id', staff.id)
          .is('deleted_at', null)
          .order('date', { ascending: false })
          .limit(12),
      ]);

      if (plannedResult.error) throw new Error(plannedResult.error.message);
      if (recentResult.error) throw new Error(recentResult.error.message);

      return {
        staffName: staff.name,
        plannedVisits: plannedResult.data ?? [],
        recentVisits: recentResult.data ?? [],
      };
    },
    staleTime: 1000 * 60 * 3,
  });
}

export function useRequestVisitCorrection() {
  const client = useQueryClient();
  return useMutation({ mutationFn: async ({ visitId, description }: { visitId: string; description: string }) => {
    const { error } = await supabase.from('correction_requests').insert({ target_table: 'outreach_visits', target_id: visitId, issue_type: 'visit_correction', description, status: 'open' });
    if (error) throw new Error(error.message);
  }, onSuccess: async () => { await client.invalidateQueries({ queryKey: ['my-work'] }); toast.success('Correction request sent for review'); }, onError: (error) => toast.error(error.message) });
}
