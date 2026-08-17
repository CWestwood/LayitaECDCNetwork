import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../auth/supabaseClient';
import { toast } from 'sonner';
import { requireRpcObject, rpcNumber, rpcString } from '../../../lib/rpcResult';

export function useDeletePractitioner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc(
        'soft_delete_practitioner',
        { p_id: id }
      );

      if (error) throw new Error(error.message);
      return requireRpcObject(data, 'Delete practitioner');
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      queryClient.invalidateQueries({ queryKey: ['ecdcs', 'with-practitioners'] });
      toast.warning(`${rpcString(data, 'name', 'Practitioner')} marked for deletion. Contact administrator to restore.`);
    },
    onError: (error) => {
      toast.error(`Delete failed: ${error.message}`);
    },
  });
}

export function useHardDeletePractitioner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc(
        'hard_delete_practitioner',
        { p_id: id }
      );

      if (error) throw new Error(error.message);
      return requireRpcObject(data, 'Permanently delete practitioner');
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['practitioners', 'deleted'] });
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      toast.success(
        `${rpcString(data, 'name', 'Practitioner')} permanently deleted (${rpcNumber(data, 'visits_deleted')} visits removed)`
      );
    },
    onError: (error) => {
      toast.error(`Permanent delete failed: ${error.message}`);
    },
  });
}
