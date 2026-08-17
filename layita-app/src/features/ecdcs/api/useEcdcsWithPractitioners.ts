// src/features/ecdcs/api/useEcdcsWithPractitioners.ts

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../auth/supabaseClient';

import type { EcdcPractitioner, EcdcWithPractitioners } from './types';
export type { EcdcPractitioner, EcdcWithPractitioners };


// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEcdcsWithPractitioners() {
  return useQuery({
    queryKey: ['ecdcs', 'with-practitioners'],
    queryFn: async (): Promise<EcdcWithPractitioners[]> => {
      const { data, error } = await supabase
        .from('ecdc_list')
        .select('id, name, area, latitude, longitude, chief, headman, practitioners(id, name, contact_number1, contact_number2, group:groups!practitioners_group_id_fkey(id, group_name), training(*))')
        .is('deleted_at', null)
        .order('name');

      if (error) throw new Error(error.message);
      return (data ?? []).map((ecdc) => ({
          id: ecdc.id,
          name: ecdc.name,
          area: ecdc.area,
          latitude: ecdc.latitude,
          longitude: ecdc.longitude,
          chief: ecdc.chief,
          headman: ecdc.headman,
          practitioners: ecdc.practitioners.map((practitioner) => ({
            id: practitioner.id,
            name: practitioner.name,
            contact_number1: practitioner.contact_number1,
            contact_number2: practitioner.contact_number2,
            group: practitioner.group,
            training: practitioner.training
              ? {
                  smart_start_ever: practitioner.training.smart_start_ever ?? false,
                  first_aid_ever: practitioner.training.first_aid_ever ?? false,
                  level4_ever: practitioner.training.level4_ever ?? false,
                  level5_ever: practitioner.training.level5_ever ?? false,
                  wordworks03_ever: practitioner.training.wordworks03_ever ?? false,
                  wordworks35_ever: practitioner.training.wordworks35_ever ?? false,
                  littlestars_ever: practitioner.training.littlestars_ever ?? false,
                }
              : null,
          })),
        }));
    },
    staleTime: 1000 * 60 * 5,
  });
}
