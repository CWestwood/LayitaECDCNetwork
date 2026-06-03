// src/features/ecdcs/api/useEcdcsWithPractitioners.ts

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../auth/supabaseClient';
import { TRAINING_FILTERS } from '../../../lib/Trainingfilters';

import type { EcdcPractitioner, EcdcWithPractitioners } from './types';
export type { EcdcPractitioner, EcdcWithPractitioners };


// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEcdcsWithPractitioners() {
  const client = useQueryClient(); // add this line temporarily
  console.log('QueryClient:', client);
  return useQuery({
    queryKey: ['ecdcs', 'with-practitioners'],
    queryFn: async (): Promise<EcdcWithPractitioners[]> => {
      const { data, error } = await supabase
        .from('ecdc_list')
        .select(`
          id, name, area, latitude, longitude,
          practitioners (
            id, name, contact_number1, contact_number2,
            group:group_id ( id, group_name ),
            training ( ${TRAINING_FILTERS.map((f) => f.key).join(', ')} )
          )
        `)
        .is('deleted_at', null)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .order('name');

      if (error) throw new Error(error.message);
      return data as EcdcWithPractitioners[];
    },
    staleTime: 1000 * 60 * 5,
  });
}