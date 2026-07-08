import { useQuery } from '@tanstack/react-query';
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
          id, name, contact_number1, contact_number2, has_whatsapp, status,
          ecdc:ecdc_id (id, name, area, chief, headman, number_children, attendance_updated, created_at),
          group:group_id (group_name),
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
      return (data ?? []).map((row: any) => ({
        ...row,
        ecdc: firstRelation(row.ecdc),
        group: firstRelation(row.group),
        training: firstRelation(row.training),
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
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });
}

// 3. Practitioner Profile Visits (Heavy - Only runs when someone is selected; excludes updates visits)
export function usePractitionerVisits(practitionerId: string | null) {
  return useQuery({
    queryKey: ['visits', 'detail', practitionerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('outreach_visits')
        .select('id, date, outreach_type, transport_type, transport_cost, transport_km, parents_trained, children_books, comments, outreach_happened')
        .eq('practitioner_id', practitionerId)
        .neq('outreach_type', 'update')
        .order('date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!practitionerId, 
    staleTime: 1000 * 60 * 5,
  });
}
