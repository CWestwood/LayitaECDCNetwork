import { useQuery } from '@tanstack/react-query';
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