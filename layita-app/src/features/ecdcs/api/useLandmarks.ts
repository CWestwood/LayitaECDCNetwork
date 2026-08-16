// src/features/settings/api/useLandmarks.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../auth/supabaseClient';

const fetchLandmarks = async () => {
  const { data, error } = await supabase
    .from('landmarks')
    .select('id, name, latitude, longitude, type')
    .order('name');

  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((landmark) =>
    landmark.latitude === null || landmark.longitude === null ? [] : [{
      ...landmark,
      latitude: landmark.latitude,
      longitude: landmark.longitude,
    }]);
};

export function useLandmarks() {
  return useQuery({
    queryKey: ['landmarks'],
    queryFn: fetchLandmarks,
    staleTime: 1000 * 60 * 60 * 8, 
  });
}
