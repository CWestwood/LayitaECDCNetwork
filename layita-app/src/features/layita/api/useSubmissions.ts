import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../auth/supabaseClient';

export interface KoboSubmissionRow {
  instance_id: string;
  submitted_at: string;
  processed_at: string | null;
  status: string | null;
  error_message: string | null;
  warnings: string | null;
  data_capturer: string | null;
  ecdc_name: string | null;
  practitioner_name: string | null;
  outreach_date: string | null;
  outreach_type: string | null;
  processing_state: string;
  processing_seconds: number | null;
  payload: any;
}

export const useSubmissions = () => {
  return useQuery<KoboSubmissionRow[]>({
    queryKey: ['kobo_submissions'],
    queryFn: async () => {
      const [subRes, labelRes] = await Promise.all([
        supabase
          .from('kobo_submission_monitor')
          .select('*')
          .order('submitted_at', { ascending: false })
          .limit(500),
        supabase
          .from('kobo_label')
          .select('list_name, name, label')
          .in('list_name', ['layitastaff', 'outreach_type'])
      ]);

      if (subRes.error) throw subRes.error;
      if (labelRes.error) throw labelRes.error;

      const submissions = subRes.data ?? [];
      const labels = labelRes.data ?? [];

      const staffMap = new Map(labels.filter(l => l.list_name === 'layitastaff').map(l => [l.name, l.label]));
      const typeMap = new Map(labels.filter(l => l.list_name === 'outreach_type').map(l => [l.name, l.label]));

      return submissions.map(sub => {
        const p = sub.payload || {};
        
        let ecdcStr = sub.ecdc_name;
        if (!ecdcStr || ecdcStr === 'Unknown' || ecdcStr === 'none') {
            ecdcStr = p['ecdc_name_text'] || p['mapping/ecdc_name_link_new'] || p['ecdc_name'];
            if (ecdcStr === 'none' || ecdcStr === 'not_found') ecdcStr = null;
        }

        let pracStr = sub.practitioner_name;
        if (!pracStr || pracStr === 'Unknown' || pracStr === 'none') {
            pracStr = p['practitioner_new'] || p['ecdc_practitioner_new'] || p['practitioner_name'];
            if (pracStr === 'none' || pracStr === 'not_found') pracStr = null;
        }

        return {
          ...sub,
          ecdc_name: ecdcStr || sub.ecdc_name,
          practitioner_name: pracStr || sub.practitioner_name,
          data_capturer: sub.data_capturer ? (staffMap.get(sub.data_capturer) || sub.data_capturer) : sub.data_capturer,
          outreach_type: sub.outreach_type ? (typeMap.get(sub.outreach_type) || sub.outreach_type) : sub.outreach_type
        };
      });
    }
  });
};