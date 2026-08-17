import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '../../auth/supabaseClient';
import { asJsonObject } from '../../../lib/rpcResult';
import type { Json } from '../../../types/database.generated';

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
  parents_attending: string | null;
  parents_enrolled: string | null;
  children_involved: string | null;
  payload: Json | null;
}

function scalarPayloadValue(payload: ReturnType<typeof asJsonObject>, ...paths: string[]): string | null {
  for (const path of paths) {
    const value = payload?.[path];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return null;
}

export async function fetchSubmissions(): Promise<KoboSubmissionRow[]> {
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

  return submissions.flatMap((sub): KoboSubmissionRow[] => {
    if (!sub.instance_id || !sub.submitted_at || !sub.processing_state) return [];
    const p = asJsonObject(sub.payload);

    let ecdcStr = sub.ecdc_name;
    if (!ecdcStr || ecdcStr === 'Unknown' || ecdcStr === 'none') {
        const candidate = p?.ecdc_name_text ?? p?.['mapping/ecdc_name_link_new'] ?? p?.ecdc_name;
        ecdcStr = typeof candidate === 'string' ? candidate : null;
        if (ecdcStr === 'none' || ecdcStr === 'not_found') ecdcStr = null;
    }

    let pracStr = sub.practitioner_name;
    if (!pracStr || pracStr === 'Unknown' || pracStr === 'none') {
        const candidate = p?.practitioner_new ?? p?.ecdc_practitioner_new ?? p?.practitioner_name;
        pracStr = typeof candidate === 'string' ? candidate : null;
        if (pracStr === 'none' || pracStr === 'not_found') pracStr = null;
    }

    return [{
      ...sub,
      instance_id: sub.instance_id,
      submitted_at: sub.submitted_at,
      processing_state: sub.processing_state,
      ecdc_name: ecdcStr || sub.ecdc_name,
      practitioner_name: pracStr || sub.practitioner_name,
      data_capturer: sub.data_capturer ? (staffMap.get(sub.data_capturer) || sub.data_capturer) : sub.data_capturer,
      outreach_type: sub.outreach_type ? (typeMap.get(sub.outreach_type) || sub.outreach_type) : sub.outreach_type,
      parents_attending: scalarPayloadValue(p, 'support/parents_present', 'parents_present', 'parents_trained'),
      parents_enrolled: scalarPayloadValue(p, 'support/parents_enrolled', 'parents_enrolled'),
      children_involved: scalarPayloadValue(p, 'support/bookdash_children', 'bookdash_children', 'children_books'),
    }];
  });
}

export const useSubmissions = () => {
  return useQuery<KoboSubmissionRow[]>({
    queryKey: ['kobo_submissions'],
    queryFn: fetchSubmissions,
    staleTime: 1000 * 60 * 2,
  });
};

export function useReprocessSubmission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instanceId: string) => {
      const { data, error } = await supabase.functions.invoke('reprocess-kobo', {
        body: { instance_id: instanceId },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kobo_submissions'] });
      queryClient.invalidateQueries({ queryKey: ['data-quality-summary'] });
      queryClient.invalidateQueries({ queryKey: ['kobo-unmatched'] });
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      toast.success('Submission reprocessed');
    },
    onError: (error) => {
      toast.error(`Reprocess failed: ${error.message}`);
    },
  });
}
