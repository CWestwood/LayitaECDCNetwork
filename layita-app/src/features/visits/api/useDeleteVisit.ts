import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../auth/supabaseClient';
import { toast } from 'sonner';
import { requireRpcObject } from '../../../lib/rpcResult';

export function useDeleteVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('soft_delete_outreach_visit', { v_id: id });
      if (error) throw new Error(error.message);
      return requireRpcObject(data, 'Delete visit');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      toast.warning('Visit marked for deletion. Contact administrator to restore.');
    },
    onError: (error) => {
      toast.error(`Delete failed: ${error.message}`);
    },
  });
}

export function useHardDeleteVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('hard_delete_outreach_visit', { v_id: id });
      if (error) throw new Error(error.message);
      return requireRpcObject(data, 'Permanently delete visit');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      queryClient.invalidateQueries({ queryKey: ['visits', 'deleted'] });
      toast.success('Visit permanently deleted');
    },
    onError: (error) => {
      toast.error(`Permanent delete failed: ${error.message}`);
    },
  });
}
