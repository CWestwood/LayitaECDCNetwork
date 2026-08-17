import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '../../auth/supabaseClient';

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// 1. Your Practitioner Directory Query (Already perfect)
export function usePractitioners() {
  return useQuery({
    queryKey: ['practitioners'], 
    queryFn: async () => {
      const { data, error } = await supabase
        .from('practitioners')
        .select(`
          id, name, contact_number1, contact_number2, has_whatsapp, status, mapping_comments,
          ecdc:ecdc_id (id, name, area, chief, headman, number_children, attendance_updated, created_at),
          group:group_id (id, group_name),
          dsd_funded, dsd_registered,
          training (
            smart_start_ever, smart_start_date,
            first_aid_ever, first_aid_date,
            level4_ever, level4_date,
            level5_ever, level5_date,
            wordworks03_ever, wordworks03_date,
            wordworks35_ever, wordworks35_date,
            littlestars_ever, littlestars_date,
            other, other_date
          )
        `)
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        ecdc: (() => {
          const ecdc = firstRelation(row.ecdc);
          return ecdc ? { ...ecdc, name: ecdc.name ?? 'Unnamed ECDC' } : null;
        })(),
        group: firstRelation(row.group),
        training: (() => {
          const training = firstRelation(row.training);
          return training ? { ...training } : null;
        })(),
      }));
    },
    staleTime: 1000 * 60 * 5,
  });
}

// 2. Global Visit Summary (Lightweight - For Badges & Stats only)
export function useGlobalVisitStats() {
  return useQuery({
    queryKey: ['visits', 'global-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('outreach_visits')
        .select('practitioner_id, date, outreach_type')
        .is('deleted_at', null)
        .neq('outreach_type', 'update') 
        .order('date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

// 3. Practitioner Profile Visits (Heavy - Only runs when someone is selected; excludes updates visits)
export function usePractitionerVisits(practitionerId: string | null) {
  return useQuery({
    queryKey: ['visits', 'detail', practitionerId],
    queryFn: async () => {
      if (!practitionerId) return [];
      const { data, error } = await supabase
        .from('outreach_visits')
        .select('id, date, outreach_type, transport_type, transport_cost, transport_km, parents_trained, children_books, comments, outreach_happened')
        .eq('practitioner_id', practitionerId)
        .neq('outreach_type', 'update')
        .order('date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!practitionerId, 
    staleTime: 1000 * 60 * 5,
  });
}

export function usePractitionerLifecycle(practitionerId: string) {
  return useQuery({ queryKey: ['practitioner-lifecycle', practitionerId], queryFn: async () => {
    const { data, error } = await supabase.from('practitioner_lifecycle_events').select('id, status, reason, comment, effective_on, changed_at').eq('practitioner_id', practitionerId).order('effective_on', { ascending: false });
    if (error) throw new Error(error.message); return data ?? [];
  }});
}

export function useSetPractitionerLifecycle() {
  const client = useQueryClient();
  return useMutation({ mutationFn: async (values: { id: string; status: string; reason: string; comment: string; effectiveOn: string }) => {
    const { data, error } = await supabase.rpc('set_practitioner_lifecycle', { p_practitioner_id: values.id, p_status: values.status, p_reason: values.reason, p_comment: values.comment || null, p_effective_on: values.effectiveOn });
    if (error) throw new Error(error.message); if (data && typeof data === 'object' && !Array.isArray(data) && 'success' in data && !data.success) throw new Error(String(data.code ?? 'Lifecycle update failed'));
  }, onSuccess: async (_, values) => { await Promise.all([client.invalidateQueries({ queryKey: ['practitioners'] }), client.invalidateQueries({ queryKey: ['practitioner-lifecycle', values.id] })]); toast.success('Practitioner status updated'); }, onError: (error) => toast.error(error.message) });
}

export function useSetMappingComments() {
  const client = useQueryClient();
  return useMutation({ mutationFn: async (values: { id: string; comments: string; reason: string }) => {
    const { data, error } = await supabase.rpc('set_practitioner_mapping_comments', { p_practitioner_id: values.id, p_comments: values.comments, p_reason: values.reason });
    if (error) throw new Error(error.message); if (data && typeof data === 'object' && !Array.isArray(data) && 'success' in data && !data.success) throw new Error(String(data.code ?? 'Mapping comment update failed'));
  }, onSuccess: async () => { await client.invalidateQueries({ queryKey: ['practitioners'] }); toast.success('Mapping comments saved'); }, onError: (error) => toast.error(error.message) });
}
