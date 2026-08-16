import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../auth/supabaseClient';
import { toast } from 'sonner';
import { requireRpcObject, rpcNumber, rpcString } from '../../../lib/rpcResult';

export function useDeleteEcdc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc(
        'soft_delete_ecdc',
        { e_id: id }
      );

      if (error) throw new Error(error.message);
      return requireRpcObject(data, 'Delete ECDC');
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ecdcs'] });
      queryClient.invalidateQueries({ queryKey: ['ecdcs', 'with-practitioners'] });
      toast.warning(`${rpcString(data, 'name', 'ECDC')} marked for deletion. Contact administrator to restore.`);
    },
    onError: (error) => {
      toast.error(`Delete failed: ${error.message}`);
    },
  });
}

export function useHardDeleteEcdc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc(
        'hard_delete_ecdc',
        { e_id: id }
      );

      if (error) throw new Error(error.message);
      return requireRpcObject(data, 'Permanently delete ECDC');
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ecdcs', 'deleted'] });
      queryClient.invalidateQueries({ queryKey: ['ecdcs'] });
      queryClient.invalidateQueries({ queryKey: ['ecdcs', 'with-practitioners'] });
      toast.success(
        `${rpcString(data, 'name', 'ECDC')} permanently deleted (${rpcNumber(data, 'practitioners_unassigned')} practitioners unassigned)`
      );
    },
    onError: (error) => {
      toast.error(`Permanent delete failed: ${error.message}`);
    },
  });
}
