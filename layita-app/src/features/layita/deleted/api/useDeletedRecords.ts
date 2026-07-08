import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '../../../auth/supabaseClient';

export function useDeletedPractitioners() {
  return useQuery({
    queryKey: ['practitioners', 'deleted'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_deleted_practitioners');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useDeletedEcdcs() {
  return useQuery({
    queryKey: ['ecdcs', 'deleted'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_deleted_ecdcs');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useDeletedVisits() {
  return useQuery({
    queryKey: ['visits', 'deleted'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_deleted_outreach_visits');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useRestorePractitioner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('restore_practitioner', { p_id: id });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      queryClient.invalidateQueries({ queryKey: ['practitioners', 'deleted'] });
      queryClient.invalidateQueries({ queryKey: ['ecdcs', 'with-practitioners'] });
      toast.success(`${data.name ?? 'Practitioner'} restored`);
    },
    onError: (error) => {
      toast.error(`Restore failed: ${error.message}`);
    },
  });
}

export function useRestoreEcdc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('restore_ecdc', { e_id: id });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ecdcs'] });
      queryClient.invalidateQueries({ queryKey: ['ecdcs', 'deleted'] });
      queryClient.invalidateQueries({ queryKey: ['ecdcs', 'with-practitioners'] });
      toast.success(`${data.name ?? 'ECDC'} restored`);
    },
    onError: (error) => {
      toast.error(`Restore failed: ${error.message}`);
    },
  });
}

export function useRestoreVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('restore_outreach_visit', { v_id: id });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      queryClient.invalidateQueries({ queryKey: ['visits', 'deleted'] });
      toast.success('Visit restored');
    },
    onError: (error) => {
      toast.error(`Restore failed: ${error.message}`);
    },
  });
}
