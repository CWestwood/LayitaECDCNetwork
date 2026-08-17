import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../auth/supabaseClient';

export interface AuditRow {
  id:               string;
  table_name:       string;
  record_id:        string;
  field_name:       string;
  old_val:          string | null;
  new_val:          string | null;
  changed_by_name:  string | null;
  changed_at:       string; // ISO string
  record_name?:     string | null;
}

interface UseAuditLogsParams {
  recordId:  string;
  tableName: string;
}

type AuditViewRow = {
  id: string | null;
  table_name: string | null;
  record_id: string | null;
  record_name: string | null;
  field_name: string | null;
  old_val: string | null;
  new_val: string | null;
  changed_by_name: string | null;
  changed_at: string | null;
};

function normalizeAuditRows(rows: AuditViewRow[]): AuditRow[] {
  return rows
    .filter((row) => row.id && row.table_name && row.record_id && row.field_name && row.changed_at)
    .map((row) => ({
      ...row,
      id: row.id as string,
      table_name: row.table_name as string,
      record_id: row.record_id as string,
      field_name: row.field_name as string,
      changed_at: row.changed_at as string,
    }));
}

export async function fetchAllAuditLogs(): Promise<AuditRow[]> {
  const { data, error } = await supabase
    .from('human_audit_logs')
    .select('id, table_name, record_id, record_name, field_name, old_val, new_val, changed_by_name, changed_at')
    .order('changed_at', { ascending: false })
    .limit(1000);

  if (error) throw new Error(error.message);
  return normalizeAuditRows(data ?? []);
}

export const useAuditLogs = ({ recordId, tableName }: UseAuditLogsParams) => {
  return useQuery<AuditRow[]>({
    queryKey: ['audit_logs', tableName, recordId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('human_audit_logs')
        .select('id, table_name, record_id, record_name, field_name, old_val, new_val, changed_by_name, changed_at')
        .eq('record_id', recordId)
        .eq('table_name', tableName)
        .order('changed_at', { ascending: false });

      if (error) throw error;
      return normalizeAuditRows(data ?? []);
    },
    enabled: !!recordId && !!tableName,
  });
};

export const useAllAuditLogs = () => {
  return useQuery<AuditRow[]>({
    queryKey: ['audit_logs_all'],
    queryFn: fetchAllAuditLogs,
  });
};
