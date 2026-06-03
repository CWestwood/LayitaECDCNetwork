import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../auth/supabaseClient';

export interface VisitRow {
  id: string | null;
  date: string | null;
  practitioner: { name: string } | null;
  outreach_type: string | null;
  outreach_happened: string | null;
  did_instead: string | null;
  data_capturer: { name: string } | null;
  transport_type: string | null;
  transport_cost: string | null;
  transport_km: string | null;
  parents_enrolled: string | null;
  parents_trained: string | null;
  children_books: string | null;
  books_per_child: string | null;
  books_to_practitioner: string | null;
  comments: string | null;
}

const fetchVisits = async (): Promise<VisitRow[]> => {
  const { data, error } = await supabase
    .from('outreach_visits')
    .select(`
      id, date, practitioner:practitioners (name), outreach_type, outreach_happened, did_instead,
      data_capturer: layita_staff (name),
      transport_type, transport_cost, transport_km,
      parents_enrolled, parents_trained,
      children_books, books_per_child, books_to_practitioner, 
      comments
    `)
    .is('deleted_at', null)
    .order('date', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as VisitRow[];
};

export function useVisits() {
  return useQuery({
    queryKey: ['visits'], 
    queryFn: fetchVisits,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}