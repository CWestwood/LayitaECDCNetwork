
// src/features/settings/api/useEcdcs.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../auth/supabaseClient';


export interface EcdcRow {
  id: string;
  name: string;
  number_children: string | null;
  chief: string | null;
  headman: string | null;
  area: { name: string } | null;
  latitude: number | null;
  longitude: number | null;
}

// 2. The fetching function
const fetchEcdcs = async (): Promise<EcdcRow[]> => {
  const { data, error } = await supabase
    .from('ecdc_list')
    .select(`
      id, name, chief, headman, number_children,
      area:area_id (name),
      latitude, longitude
    `)
    .is('deleted_at', null)
    .order('name');

  if (error) throw new Error(error.message);
  return data as EcdcRow[];
};

// 3. The React Query Hook
export function useEcdcs() {
  return useQuery({
    queryKey: ['ecdcs'], 
    queryFn: fetchEcdcs,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}