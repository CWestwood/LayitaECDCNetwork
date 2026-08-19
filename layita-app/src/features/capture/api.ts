import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../auth/supabaseClient';
import { correlationId } from '../../lib/correlation';
import { asJsonObject } from '../../lib/rpcResult';
import type { Json } from '../../types/database.generated';
import type { CaptureResult, IdentityKind, NamedOption } from './model';
import { CAPTURE_FORM_VERSION } from './model';

export interface CaptureOptions {
  ecdcs: NamedOption[];
  practitioners: NamedOption[];
}

export function useCaptureOptions() {
  return useQuery<CaptureOptions>({
    queryKey: ['capture', 'options'],
    queryFn: async () => {
      const [ecdcResponse, practitionerResponse] = await Promise.all([
        supabase
          .from('ecdc_list')
          .select('id, name, area, chief, headman')
          .is('deleted_at', null)
          .order('name'),
        supabase
          .from('practitioners')
          .select('id, name, status, ecdc:ecdc_id(name)')
          .is('deleted_at', null)
          .order('name'),
      ]);
      if (ecdcResponse.error) throw new Error(ecdcResponse.error.message);
      if (practitionerResponse.error) throw new Error(practitionerResponse.error.message);

      return {
        ecdcs: (ecdcResponse.data ?? []).flatMap((row): NamedOption[] => row.name ? [{
          id: row.id,
          name: row.name,
          detail: [row.area, row.chief ? `Chief ${row.chief}` : null, row.headman ? `Headman ${row.headman}` : null]
            .filter(Boolean).join(' · '),
        }] : []),
        practitioners: (practitionerResponse.data ?? []).flatMap((row): NamedOption[] => row.name ? [{
          id: row.id,
          name: row.name,
          detail: [row.ecdc?.name, row.status && row.status.toLowerCase() !== 'active' ? row.status : null]
            .filter(Boolean).join(' · '),
        }] : []),
      };
    },
    staleTime: 1000 * 60 * 5,
  });
}

export interface SubmitCaptureInput {
  captureId: string;
  clientCreatedAt: string;
  payload: Json;
}

export async function submitCapture(input: SubmitCaptureInput): Promise<CaptureResult> {
  const { data, error } = await supabase.rpc('submit_outreach_capture', {
    p_capture_id: input.captureId,
    p_source: 'website',
    p_form_version: CAPTURE_FORM_VERSION,
    p_payload: input.payload,
    p_client_created_at: input.clientCreatedAt,
    p_correlation_id: correlationId(),
  });
  if (error) throw new Error(error.message);
  const result = asJsonObject(data);
  if (!result || typeof result.success !== 'boolean') {
    throw new Error('The server returned an invalid capture response.');
  }
  return {
    success: result.success,
    duplicate: typeof result.duplicate === 'boolean' ? result.duplicate : undefined,
    visit_id: typeof result.visit_id === 'string' ? result.visit_id : undefined,
    ecdc_id: typeof result.ecdc_id === 'string' ? result.ecdc_id : null,
    practitioner_id: typeof result.practitioner_id === 'string' ? result.practitioner_id : null,
    code: typeof result.code === 'string' ? result.code : undefined,
  };
}

export function useSubmitCapture() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['capture', 'submit'],
    mutationFn: submitCapture,
    onSuccess: async (result) => {
      if (!result.success) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['capture-submissions'] }),
      ]);
    },
  });
}

export interface ReviewRequestInput {
  captureId: string;
  kind: IdentityKind;
  name: string;
  notes: string;
  outreachType: string;
  date: string;
}

export async function requestIdentityReview(input: ReviewRequestInput) {
  const description = [
    `Website capture reference: ${input.captureId}`,
    `Form version: ${CAPTURE_FORM_VERSION}`,
    `Missing ${input.kind}: ${input.name.trim()}`,
    `Outreach: ${input.outreachType || 'not selected'} on ${input.date || 'date not selected'}`,
    input.notes.trim() ? `Capturer note: ${input.notes.trim()}` : null,
  ].filter(Boolean).join('\n');

  // An uncertain network response can be retried safely without creating a
  // second review item for the same immutable capture reference and details.
  const { data: existing, error: existingError } = await supabase
    .from('correction_requests')
    .select('id')
    .eq('issue_type', 'capture_identity_not_found')
    .eq('description', description)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from('correction_requests')
    .insert({
      target_table: input.kind === 'ecdc' ? 'ecdc_list' : 'practitioners',
      issue_type: 'capture_identity_not_found',
      description,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export function useRequestIdentityReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['capture', 'identity-review'],
    mutationFn: requestIdentityReview,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['capture-review-requests'] });
    },
  });
}
