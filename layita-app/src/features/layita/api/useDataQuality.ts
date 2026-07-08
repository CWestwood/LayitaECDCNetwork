import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '../../auth/supabaseClient';

export interface DataQualityMetric {
  metric_key: string;
  label: string;
  value: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface UnmatchedRecord {
  id: string;
  instance_id: string | null;
  field: string | null;
  raw_value: string | null;
  created_at: string;
}

export interface PractitionerOption {
  id: string;
  name: string | null;
  contact_number1?: string | null;
  contact_number2?: string | null;
  has_whatsapp?: boolean | null;
  dsd_registered?: boolean | null;
  dsd_funded?: boolean | null;
  group?: string | null;
  status?: string | null;
  ecdc_list?: { name: string | null } | null;
  groups?: { group_name: string | null } | null;
}

export interface EcdcOption {
  id: string;
  name: string | null;
  area: string | null;
  longitude: number | null;
  latitude: number | null;
  chief: string | null;
  headman: string | null;
  number_children: string | null;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function useDataQualitySummary() {
  return useQuery<DataQualityMetric[]>({
    queryKey: ['data-quality-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_quality_summary')
        .select('metric_key, label, value, severity')
        .order('severity', { ascending: true });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 1000 * 60 * 2,
  });
}

export function useUnmatchedRecords() {
  return useQuery<UnmatchedRecord[]>({
    queryKey: ['kobo-unmatched'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kobo_unmatched')
        .select('id, instance_id, field, raw_value, created_at')
        .is('resolved_at', null)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 1000 * 60 * 2,
  });
}

export function usePractitionerOptions() {
  return useQuery<PractitionerOption[]>({
    queryKey: ['practitioners', 'options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('practitioners')
        .select(`
          id, name, contact_number1, contact_number2, has_whatsapp,
          dsd_registered, dsd_funded, group, status,
          ecdc_list(name),
          groups:group_id(group_name)
        `)
        .is('deleted_at', null)
        .order('name');

      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useEcdcOptions() {
  return useQuery<EcdcOption[]>({
    queryKey: ['ecdcs', 'options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ecdc_list')
        .select('id, name, area, longitude, latitude, chief, headman, number_children')
        .is('deleted_at', null)
        .order('name');

      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useResolveUnmatched() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      resolvedId,
      resolutionType,
      note,
    }: {
      id: string;
      resolvedId?: string | null;
      resolutionType: 'link' | 'reviewed' | 'ignore';
      note?: string;
    }) => {
      const { data, error } = await supabase.rpc('resolve_unmatched_submission', {
        p_unmatched_id: id,
        p_resolved_id: resolvedId ?? null,
        p_resolution_type: resolutionType,
        p_note: note ?? null,
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kobo-unmatched'] });
      queryClient.invalidateQueries({ queryKey: ['data-quality-summary'] });
      toast.success('Unmatched record updated');
    },
    onError: (error) => {
      toast.error(`Could not update unmatched record: ${error.message}`);
    },
  });
}

export function useMergePractitioners() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      keepId,
      discardId,
      fieldChoices,
    }: {
      keepId: string;
      discardId: string;
      fieldChoices: Record<string, string>;
    }) => {
      const { data, error } = await supabase.rpc('merge_practitioners', {
        keep_id: keepId,
        discard_id: discardId,
        field_choices: fieldChoices,
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      queryClient.invalidateQueries({ queryKey: ['practitioners', 'options'] });
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      queryClient.invalidateQueries({ queryKey: ['audit_logs_all'] });
      queryClient.invalidateQueries({ queryKey: ['data-quality-summary'] });
      toast.success(data?.message ?? 'Practitioners merged');
    },
    onError: (error) => {
      toast.error(`Merge failed: ${error.message}`);
    },
  });
}

export function useMergeEcdcs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      keepId,
      discardId,
      fieldChoices,
    }: {
      keepId: string;
      discardId: string;
      fieldChoices: Record<string, string>;
    }) => {
      const { data, error } = await supabase.rpc('merge_ecdcs', {
        keep_id: keepId,
        discard_id: discardId,
        field_choices: fieldChoices,
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ecdcs'] });
      queryClient.invalidateQueries({ queryKey: ['ecdcs', 'options'] });
      queryClient.invalidateQueries({ queryKey: ['ecdcs', 'with-practitioners'] });
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      queryClient.invalidateQueries({ queryKey: ['practitioners', 'options'] });
      queryClient.invalidateQueries({ queryKey: ['audit_logs_all'] });
      queryClient.invalidateQueries({ queryKey: ['data-quality-summary'] });
      toast.success(data?.message ?? 'ECDCs merged');
    },
    onError: (error) => {
      toast.error(`Merge failed: ${error.message}`);
    },
  });
}
