import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '../../auth/supabaseClient';

export interface PlanningRow {
  id: string;
  scheduled_date: string | null;
  practitioner_name: string | null;
  outreach_type: string | null;
  status: string | null;
  assigned_to: { id: string; name: string | null } | null;
  practitioner: {
    id: string;
    name: string | null;
    contact_number1: string | null;
    contact_number2: string | null;
    ecdc: {
      id: string;
      name: string | null;
      area: string | null;
    } | null;
  } | null;
  updated_at: string | null;
  notes: string | null;
  cancellation_reason: string | null;
}

export interface PlanningPractitionerOption {
  id: string;
  name: string | null;
  contact_number1: string | null;
  contact_number2: string | null;
  ecdc: { id: string; name: string | null; area: string | null; latitude: number | null; longitude: number | null } | null;
}

export interface StaffOption {
  id: string;
  name: string | null;
}

const fetchPlannedVisits = async (): Promise<PlanningRow[]> => {
  const { data, error } = await supabase
    .from('planned_visits')
    .select(`
      id, scheduled_date, practitioner_name, outreach_type, status, notes, cancellation_reason,
      assigned_to:layita_staff!planned_visits_assigned_to_fkey (id, name),
      practitioner:practitioners!planned_visits_practitioner_id_fkey (
        id, name, contact_number1, contact_number2,
        ecdc:ecdc_id (id, name, area)
      ),
      updated_at
    `)
    .order('scheduled_date', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as PlanningRow[];
};

export function usePlannedVisits() {
  return useQuery({
    queryKey: ['planned_visits'],
    queryFn: fetchPlannedVisits,
    staleTime: 1000 * 60 * 5,
  });
}

export function usePlanningPractitioners() {
  return useQuery<PlanningPractitionerOption[]>({
    queryKey: ['planning', 'practitioners'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('practitioners')
        .select('id, name, contact_number1, contact_number2, ecdc:ecdc_id(id, name, area, latitude, longitude)')
        .is('deleted_at', null)
        .order('name');

      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function usePlanningStaff() {
  return useQuery<StaffOption[]>({
    queryKey: ['planning', 'staff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('layita_staff')
        .select('id, name')
        .order('name');

      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreatePlannedVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      practitioners,
      scheduledDate,
      outreachType,
      assignedTo,
      notes,
    }: {
      practitioners: { id: string; name: string }[];
      scheduledDate: string;
      outreachType: string;
      assignedTo: string | null;
      notes: string;
    }) => {
      const { data, error } = await supabase
        .from('planned_visits')
        .insert(practitioners.map((practitioner) => ({
          practitioner_id: practitioner.id,
          practitioner_name: practitioner.name,
          scheduled_date: scheduledDate,
          outreach_type: outreachType,
          assigned_to: assignedTo,
          notes: notes || null,
          status: 'planned',
        })))
        .select('id')

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned_visits'] });
      queryClient.invalidateQueries({ queryKey: ['my-work'] });
      toast.success('Planned visit list created');
    },
    onError: (error) => {
      toast.error(`Could not create planned visit: ${error.message}`);
    },
  });
}

export function useManagePlannedVisit() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: async (values: { id: string; status?: string; scheduledDate?: string; assignedTo?: string | null; outreachType?: string; notes?: string; reason?: string }) => {
    const { data, error } = await supabase.rpc('manage_planned_visit', { p_plan_id: values.id, p_status: values.status, p_scheduled_date: values.scheduledDate, p_assigned_to: values.assignedTo, p_update_assignee: values.assignedTo !== undefined, p_outreach_type: values.outreachType, p_notes: values.notes, p_reason: values.reason });
    if (error) throw new Error(error.message);
    if (data && typeof data === 'object' && 'success' in data && !data.success) throw new Error(String(data.code ?? 'Plan update failed'));
  }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['planned_visits'] }); await queryClient.invalidateQueries({ queryKey: ['my-work'] }); toast.success('Plan updated'); }, onError: (error) => toast.error(error.message) });
}
