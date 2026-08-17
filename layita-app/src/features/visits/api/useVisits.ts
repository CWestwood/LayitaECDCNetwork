import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../auth/supabaseClient';

export interface VisitRow {
  id: string;
  date: string | null;
  practitioner_id: string | null;
  practitioner: {
    id: string;
    name: string | null;
    contact_number1: string | null;
    contact_number2: string | null;
    ecdc: {
      id: string;
      name: string | null;
      area: string | null;
      number_children: number | string | null;
    } | null;
  } | null;
  outreach_type: string | null;
  outreach_happened: string | null;
  did_instead: string | null;
  data_capturer_id: string | null;
  data_capturer: { id: string; name: string | null } | null;
  transport_type: string | null;
  transport_cost: string | null;
  transport_km: string | null;
  parents_enrolled: string | null;
  parents_trained: string | null;
  children_books: string | null;
  books_per_child: string | null;
  books_to_practitioner: string | null;
  comments: string | null;
  source: string | null;
  kobo_instance_id: string | null;
  parents_attending: number | null;
  children_receiving_books: number | null;
  books_distributed_to_children: number | null;
  books_left_with_practitioner: number | null;
  attendance_rate_percent: number | null;
  public_transport_accessible: boolean | null;
  bookdash_given: boolean | null;
  photos_uploaded_to_album: boolean | null;
  photo_album_url: string | null;
  participants: {
    participation_role: string;
    practitioner: { id: string; name: string | null } | null;
  }[];
}

const fetchVisits = async (): Promise<VisitRow[]> => {
  const { data, error } = await supabase
    .from('outreach_visits')
    .select(`
      id, date, practitioner_id,
      practitioner:practitioners!outreach_visits_practitioner_id_fkey (
        id, name, contact_number1, contact_number2,
        ecdc:ecdc_id (id, name, area, number_children)
      ),
      outreach_type, outreach_happened, did_instead,
      data_capturer_id, data_capturer:layita_staff (id, name),
      transport_type, transport_cost, transport_km,
      parents_enrolled, parents_trained,
      children_books, books_per_child, books_to_practitioner,
      parents_attending, children_receiving_books, books_distributed_to_children,
      books_left_with_practitioner, attendance_rate_percent,
      public_transport_accessible, bookdash_given, photos_uploaded_to_album, photo_album_url,
      participants:outreach_visit_practitioners(participation_role, practitioner:practitioners(id, name)),
      comments, source, kobo_instance_id
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
    staleTime: 1000 * 60 * 5,
  });
}

export function useRawKoboSubmission(instanceId: string | null | undefined) {
  return useQuery({
    queryKey: ['kobo-raw-submission', instanceId],
    queryFn: async () => {
      if (!instanceId) return null;
      const { data, error } = await supabase
        .from('kobo_raw_submissions')
        .select('instance_id, submitted_at, payload')
        .eq('instance_id', instanceId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!instanceId,
    staleTime: 1000 * 60 * 5,
  });
}
