import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '../../auth/supabaseClient';

export interface TrainingSessionRow {
  id: string; course_code: string; title: string; session_date: string; venue: string | null;
  facilitator: string | null; status: string; notes: string | null; evidence_url: string | null;
  attendance: { practitioner_id: string; attendance_status: string; notes: string | null; practitioner: { id: string; name: string | null; ecdc: { name: string | null } | null } | null }[];
}

export function useTrainingData() {
  return useQuery({ queryKey: ['training-sessions'], queryFn: async () => {
    const [sessionsResult, coursesResult, practitionersResult] = await Promise.all([
      supabase.from('training_sessions').select(`id, course_code, title, session_date, venue, facilitator, status, notes, evidence_url,
        attendance:training_session_attendance(practitioner_id, attendance_status, notes, practitioner:practitioners(id, name, ecdc:ecdc_id(name)))`).order('session_date', { ascending: false }),
      supabase.from('training_courses').select('code, name, active').eq('active', true).order('name'),
      supabase.from('practitioners').select('id, name, ecdc:ecdc_id(name)').is('deleted_at', null).eq('status', 'active').order('name'),
    ]);
    const firstError = sessionsResult.error || coursesResult.error || practitionersResult.error;
    if (firstError) throw new Error(firstError.message);
    return { sessions: (sessionsResult.data ?? []) as TrainingSessionRow[], courses: coursesResult.data ?? [], practitioners: practitionersResult.data ?? [] };
  }});
}

export function useCreateTrainingSession() {
  const client = useQueryClient();
  return useMutation({ mutationFn: async (values: { course_code: string; title: string; session_date: string; venue: string; facilitator: string }) => {
    const { error } = await supabase.from('training_sessions').insert({ ...values, venue: values.venue || null, facilitator: values.facilitator || null });
    if (error) throw new Error(error.message);
  }, onSuccess: async () => { await client.invalidateQueries({ queryKey: ['training-sessions'] }); toast.success('Training session created'); }, onError: (error) => toast.error(error.message) });
}

export function useSaveAttendance() {
  const client = useQueryClient();
  return useMutation({ mutationFn: async ({ sessionId, rows }: { sessionId: string; rows: { practitioner_id: string; attendance_status: string }[] }) => {
    const { error } = await supabase.from('training_session_attendance').upsert(rows.map((row) => ({ ...row, session_id: sessionId })), { onConflict: 'session_id,practitioner_id' });
    if (error) throw new Error(error.message);
  }, onSuccess: async () => { await client.invalidateQueries({ queryKey: ['training-sessions'] }); toast.success('Attendance saved'); }, onError: (error) => toast.error(error.message) });
}

export function useUpdateTrainingSession() {
  const client = useQueryClient();
  return useMutation({ mutationFn: async ({ id, status }: { id: string; status: string }) => {
    const { error } = await supabase.from('training_sessions').update({ status }).eq('id', id);
    if (error) throw new Error(error.message);
  }, onSuccess: async () => { await client.invalidateQueries({ queryKey: ['training-sessions'] }); toast.success('Session updated'); }, onError: (error) => toast.error(error.message) });
}
