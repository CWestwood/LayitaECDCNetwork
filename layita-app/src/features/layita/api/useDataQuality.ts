import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '../../auth/supabaseClient';
import { requireRpcObject, rpcBoolean, rpcString } from '../../../lib/rpcResult';

export interface DataQualityMetric {
  metric_key: string;
  label: string;
  value: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface UnmatchedRecord {
  id: string;
  instance_id: string | null;
  field: string | null;
  raw_value: string | null;
  created_at: string;
}

export interface DuplicateVisitSummary {
  id: string;
  date: string | null;
  practitionerNames: string[];
  ecdcName: string | null;
  dataCapturerName: string | null;
  parentsAttending: number | string | null;
  parentsEnrolled: number | string | null;
  childrenInvolved: number | string | null;
}

export interface DuplicateVisitCandidate {
  visit_a_id: string;
  visit_b_id: string;
  date: string;
  confidence_score: number;
  instance_a: string | null;
  instance_b: string | null;
  visitA: DuplicateVisitSummary;
  visitB: DuplicateVisitSummary;
}

export interface PractitionerOption {
  id: string;
  name: string | null;
  contact_number1?: string | null;
  contact_number2?: string | null;
  has_whatsapp?: boolean | null;
  dsd_registered?: boolean | null;
  dsd_funded?: boolean | null;
  group?: string | null;
  status?: string | null;
  ecdc_list?: { name: string | null } | null;
  groups?: { group_name: string | null } | null;
}

export interface EcdcOption {
  id: string;
  name: string | null;
  area: string | null;
  longitude: number | null;
  latitude: number | null;
  chief: string | null;
  headman: string | null;
  number_children: string | null;
}

export interface CaptureReviewRequest {
  id: string;
  created_at: string;
  target_table: string;
  description: string;
  status: 'open' | 'reviewing';
}

function severity(value: string | null): DataQualityMetric['severity'] {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low'
    ? value
    : 'low';
}

export async function fetchDataQualitySummary(): Promise<DataQualityMetric[]> {
  const { data, error } = await supabase
    .from('data_quality_summary')
    .select('metric_key, label, value, severity')
    .order('severity', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((metric, index) => ({
    metric_key: metric.metric_key ?? `metric-${index}`,
    label: metric.label ?? 'Unnamed metric',
    value: metric.value ?? 0,
    severity: severity(metric.severity),
  }));
}

export async function fetchUnmatchedRecords(): Promise<UnmatchedRecord[]> {
  const { data, error } = await supabase
    .from('kobo_unmatched')
    .select('id, instance_id, field, raw_value, created_at')
    .is('resolved_at', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((record): UnmatchedRecord[] => record.created_at
    ? [{ ...record, created_at: record.created_at }]
    : []);
}

export function useDataQualitySummary() {
  return useQuery<DataQualityMetric[]>({
    queryKey: ['data-quality-summary'],
    queryFn: fetchDataQualitySummary,
    staleTime: 1000 * 60 * 2,
  });
}

export function useUnmatchedRecords() {
  return useQuery<UnmatchedRecord[]>({
    queryKey: ['kobo-unmatched'],
    queryFn: fetchUnmatchedRecords,
    staleTime: 1000 * 60 * 2,
  });
}

export function useCaptureReviewRequests() {
  return useQuery<CaptureReviewRequest[]>({
    queryKey: ['capture-review-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('correction_requests')
        .select('id, created_at, target_table, description, status')
        .eq('issue_type', 'capture_identity_not_found')
        .in('status', ['open', 'reviewing'])
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).flatMap((row): CaptureReviewRequest[] => (
        row.status === 'open' || row.status === 'reviewing' ? [{ ...row, status: row.status }] : []
      ));
    },
    staleTime: 1000 * 60,
  });
}

export function useUpdateCaptureReviewRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action, notes }: { id: string; action: 'reviewing' | 'resolved'; notes?: string }) => {
      if (action === 'reviewing') {
        const { error } = await supabase.from('correction_requests').update({ status: 'reviewing' }).eq('id', id);
        if (error) throw new Error(error.message);
        return;
      }
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error(authError?.message ?? 'Your session has expired.');
      const { error } = await supabase.from('correction_requests').update({
        status: 'resolved',
        resolution_notes: notes?.trim() || 'Identity reviewed and resolved.',
        resolved_at: new Date().toISOString(),
        resolved_by_id: authData.user.id,
      }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['capture-review-requests'] });
      toast.success('Website capture review updated');
    },
    onError: (error) => toast.error(`Review could not be updated: ${error.message}`),
  });
}

export function useDuplicateVisitCandidates() {
  return useQuery<DuplicateVisitCandidate[]>({
    queryKey: ['outreach-duplicate-candidates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('outreach_duplicate_candidates')
        .select('visit_a_id, visit_b_id, date, confidence_score, instance_a, instance_b')
        .gte('confidence_score', 70)
        .order('confidence_score', { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);

      const candidates = (data ?? []).flatMap((candidate) => {
        if (!candidate.visit_a_id || !candidate.visit_b_id || !candidate.date) return [];
        return [{
          ...candidate,
          visit_a_id: candidate.visit_a_id,
          visit_b_id: candidate.visit_b_id,
          date: candidate.date,
          confidence_score: candidate.confidence_score ?? 0,
        }];
      });

      if (candidates.length === 0) return [];

      const visitIds = [...new Set(candidates.flatMap((candidate) => [candidate.visit_a_id, candidate.visit_b_id]))];
      const { data: visits, error: visitsError } = await supabase
        .from('outreach_visits')
        .select(`
          id, date, parents_enrolled, parents_attending, parents_trained,
          children_receiving_books, children_books,
          practitioner:practitioners!outreach_visits_practitioner_id_fkey(name, ecdc:ecdc_id(name)),
          data_capturer:layita_staff(name),
          participants:outreach_visit_practitioners(practitioner:practitioners(name))
        `)
        .in('id', visitIds);

      if (visitsError) throw new Error(visitsError.message);

      const summaries = new Map<string, DuplicateVisitSummary>();
      for (const visit of visits ?? []) {
        const participantNames = (visit.participants ?? [])
          .map((participant) => participant.practitioner?.name)
          .filter((name): name is string => Boolean(name));
        const primaryName = visit.practitioner?.name;
        summaries.set(visit.id, {
          id: visit.id,
          date: visit.date,
          practitionerNames: participantNames.length ? participantNames : primaryName ? [primaryName] : [],
          ecdcName: visit.practitioner?.ecdc?.name ?? null,
          dataCapturerName: visit.data_capturer?.name ?? null,
          parentsAttending: visit.parents_attending ?? visit.parents_trained,
          parentsEnrolled: visit.parents_enrolled,
          childrenInvolved: visit.children_receiving_books ?? visit.children_books,
        });
      }

      return candidates.flatMap((candidate): DuplicateVisitCandidate[] => {
        const visitA = summaries.get(candidate.visit_a_id);
        const visitB = summaries.get(candidate.visit_b_id);
        return visitA && visitB ? [{ ...candidate, visitA, visitB }] : [];
      });
    },
    staleTime: 1000 * 60 * 2,
  });
}

export function useResolveDuplicateVisit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ keepId, discardId, reason }: { keepId: string; discardId: string; reason: string }) => {
      const { data, error } = await supabase.rpc('resolve_duplicate_outreach_visit', {
        p_keep_id: keepId,
        p_discard_id: discardId,
        p_reason: reason,
        p_action: 'merge',
      });
      if (error) throw new Error(error.message);
      const result = requireRpcObject(data, 'Resolve duplicate visit');
      if (rpcBoolean(result, 'success') !== true) {
        throw new Error(rpcString(result, 'code', 'Duplicate resolution failed'));
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach-duplicate-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['kobo-reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      queryClient.invalidateQueries({ queryKey: ['audit_logs_all'] });
      toast.success('Duplicate visit merged without double-counting');
    },
    onError: (error) => toast.error(`Duplicate could not be resolved: ${error.message}`),
  });
}

export function usePractitionerOptions() {
  return useQuery<PractitionerOption[]>({
    queryKey: ['practitioners', 'options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('practitioners')
        .select(`
          id, name, contact_number1, contact_number2, has_whatsapp,
          dsd_registered, dsd_funded, group, status,
          ecdc_list(name),
          groups:group_id(group_name)
        `)
        .is('deleted_at', null)
        .order('name');

      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useEcdcOptions() {
  return useQuery<EcdcOption[]>({
    queryKey: ['ecdcs', 'options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ecdc_list')
        .select('id, name, area, longitude, latitude, chief, headman, number_children')
        .is('deleted_at', null)
        .order('name');

      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useResolveUnmatched() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      resolvedId,
      resolutionType,
      note,
    }: {
      id: string;
      resolvedId?: string | null;
      resolutionType: 'link' | 'reviewed' | 'ignore';
      note?: string;
    }) => {
      const { data, error } = await supabase.rpc('resolve_unmatched_submission', {
        p_unmatched_id: id,
        p_resolution_type: resolutionType,
        ...(resolvedId ? { p_resolved_id: resolvedId } : {}),
        ...(note ? { p_note: note } : {}),
      });

      if (error) throw new Error(error.message);
      return requireRpcObject(data, 'Resolve unmatched submission');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kobo-unmatched'] });
      queryClient.invalidateQueries({ queryKey: ['data-quality-summary'] });
      toast.success('Unmatched record updated');
    },
    onError: (error) => {
      toast.error(`Could not update unmatched record: ${error.message}`);
    },
  });
}

export function useMergePractitioners() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      keepId,
      discardId,
      fieldChoices,
    }: {
      keepId: string;
      discardId: string;
      fieldChoices: Record<string, string>;
    }) => {
      const { data, error } = await supabase.rpc('merge_practitioners', {
        keep_id: keepId,
        discard_id: discardId,
        field_choices: fieldChoices,
      });

      if (error) throw new Error(error.message);
      return requireRpcObject(data, 'Merge practitioners');
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      queryClient.invalidateQueries({ queryKey: ['practitioners', 'options'] });
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      queryClient.invalidateQueries({ queryKey: ['audit_logs_all'] });
      queryClient.invalidateQueries({ queryKey: ['data-quality-summary'] });
      toast.success(rpcString(data, 'message', 'Practitioners merged'));
    },
    onError: (error) => {
      toast.error(`Merge failed: ${error.message}`);
    },
  });
}

export function useMergeEcdcs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      keepId,
      discardId,
      fieldChoices,
    }: {
      keepId: string;
      discardId: string;
      fieldChoices: Record<string, string>;
    }) => {
      const { data, error } = await supabase.rpc('merge_ecdcs', {
        keep_id: keepId,
        discard_id: discardId,
        field_choices: fieldChoices,
      });

      if (error) throw new Error(error.message);
      return requireRpcObject(data, 'Merge ECDCs');
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ecdcs'] });
      queryClient.invalidateQueries({ queryKey: ['ecdcs', 'options'] });
      queryClient.invalidateQueries({ queryKey: ['ecdcs', 'with-practitioners'] });
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      queryClient.invalidateQueries({ queryKey: ['practitioners', 'options'] });
      queryClient.invalidateQueries({ queryKey: ['audit_logs_all'] });
      queryClient.invalidateQueries({ queryKey: ['data-quality-summary'] });
      toast.success(rpcString(data, 'message', 'ECDCs merged'));
    },
    onError: (error) => {
      toast.error(`Merge failed: ${error.message}`);
    },
  });
}
