import { supabase } from '../../auth/supabaseClient';
import { requireRpcObject, rpcBoolean, rpcString } from '../../../lib/rpcResult';

export interface KoboLabelOption {
  list_name: string;
  name: string;
  label: string;
}

export interface PractitionerOption {
  id: string;
  name: string;
}

export async function fetchVisitEditOptions() {
  const [practitionerResult, labelResult] = await Promise.all([
    supabase.from('practitioners').select('id, name').order('name'),
    supabase
      .from('kobo_label')
      .select('list_name, name, label')
      .in('list_name', ['outreach_type', 'yesno_other']),
  ]);

  if (practitionerResult.error) throw new Error(practitionerResult.error.message);
  if (labelResult.error) throw new Error(labelResult.error.message);

  return {
    practitioners: (practitionerResult.data ?? []).map((practitioner) => ({
      ...practitioner,
      name: practitioner.name ?? 'Unnamed practitioner',
    })),
    outreachTypes: (labelResult.data ?? []).filter((label) => label.list_name === 'outreach_type'),
    outreachHappened: (labelResult.data ?? []).filter((label) => label.list_name === 'yesno_other'),
  };
}

export async function correctVisit(
  visitId: string,
  changes: Record<string, string | number | null>,
  reason: string,
) {
  const { data, error } = await supabase.rpc('correct_outreach_visit', {
    p_visit_id: visitId,
    p_changes: changes,
    p_reason: reason,
  });

  if (error) throw new Error(error.message);
  const result = requireRpcObject(data, 'Correct outreach visit');
  if (rpcBoolean(result, 'success') !== true) {
    throw new Error(rpcString(result, 'code', 'The visit could not be corrected.'));
  }
  return result;
}
