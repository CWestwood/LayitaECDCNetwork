import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import Sidebar from '../../layouts/Sidebar';
import { supabase } from '../auth/supabaseClient';
import { fetchSubmissions } from './api/useSubmissions';
import '../../styles/shared.css';
import '../../styles/data-quality.css';

interface QualityAuditShellProps {
  children: ReactNode;
}

const tabs = [
  { to: '/data-quality', label: 'Data Quality' },
  { to: '/kobo-monitor', label: 'Kobo Monitor' },
  { to: '/audit', label: 'Audit Logs' },
];

export default function QualityAuditShell({ children }: QualityAuditShellProps) {
  const location = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: ['data-quality-summary'],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('data_quality_summary')
          .select('metric_key, label, value, severity')
          .order('severity', { ascending: true });
        if (error) throw error;
        return data ?? [];
      },
      staleTime: 1000 * 60 * 2,
    });

    queryClient.prefetchQuery({
      queryKey: ['kobo-unmatched'],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('kobo_unmatched')
          .select('id, instance_id, field, raw_value, created_at')
          .is('resolved_at', null)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return data ?? [];
      },
      staleTime: 1000 * 60 * 2,
    });

    queryClient.prefetchQuery({
      queryKey: ['kobo_submissions'],
      queryFn: fetchSubmissions,
      staleTime: 1000 * 60 * 2,
    });

    queryClient.prefetchQuery({
      queryKey: ['audit_logs_all'],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('human_audit_logs')
          .select('id, table_name, record_id, record_name, field_name, old_val, new_val, changed_by_name, changed_at')
          .order('changed_at', { ascending: false })
          .limit(1000);
        if (error) throw error;
        return data ?? [];
      },
      staleTime: 1000 * 60 * 2,
    });
  }, [queryClient]);

  return (
    <div className="page dq-page">
      <Sidebar />

      <main className="dq-main">
        <header className="dq-header">
          <div>
            <h1 className="dq-title">Quality & Audit</h1>
            <p className="dq-subtitle">Review data quality, Kobo processing, merge duplicates, and audit activity.</p>
          </div>
        </header>

        <nav className="dq-admin-tabs" aria-label="Quality and audit sections">
          {tabs.map((tab) => (
            <Link
              key={tab.to}
              className={`dq-admin-tab${location.pathname === tab.to ? ' dq-admin-tab--active' : ''}`}
              to={tab.to}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        {children}
      </main>
    </div>
  );
}
