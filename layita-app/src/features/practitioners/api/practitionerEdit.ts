import { supabase } from '../../auth/supabaseClient';
import type { Database } from '../../../types/database.generated';

type PractitionerChanges = Database['public']['Tables']['practitioners']['Update'];
type TrainingChanges = Omit<Database['public']['Tables']['training']['Insert'], 'id'>;

export async function fetchPractitionerEditOptions() {
  const [groupResult, ecdcResult] = await Promise.all([
    supabase.from('groups').select('id, group_name').order('group_name'),
    supabase.from('ecdc_list').select('id, name').order('name'),
  ]);

  if (groupResult.error) throw new Error(groupResult.error.message);
  if (ecdcResult.error) throw new Error(ecdcResult.error.message);

  return {
    groups: groupResult.data ?? [],
    ecdcs: (ecdcResult.data ?? []).map((ecdc) => ({
      ...ecdc,
      name: ecdc.name ?? 'Unnamed ECDC',
    })),
  };
}

export async function savePractitionerEdits(
  practitionerId: string,
  changes: PractitionerChanges,
  training: TrainingChanges,
) {
  const { error, count } = await supabase
    .from('practitioners')
    .update(changes, { count: 'exact' })
    .eq('id', practitionerId);

  if (error) throw new Error(error.message);
  if (count === 0) throw new Error('Permission denied - only administrators can edit practitioners.');

  const { error: trainingError } = await supabase
    .from('training')
    .upsert({ id: practitionerId, ...training });

  if (trainingError) throw new Error(`Failed to save training data: ${trainingError.message}`);
}
