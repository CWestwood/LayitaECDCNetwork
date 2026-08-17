import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import type { Capability } from '../auth/capabilities';
import { fetchSubmissions } from './api/useSubmissions';
import { fetchDataQualitySummary, fetchUnmatchedRecords } from './api/useDataQuality';
import { fetchAllAuditLogs } from './api/useAudit';
import '../../styles/shared.css';
import '../../styles/data-quality.css';

const tabs: Array<{ to: string; label: string; capability?: Capability }> = [
  { to: '/data-quality', label: 'Data Quality' },
  { to: '/kobo-monitor', label: 'Kobo Monitor', capability: 'reprocess_kobo' as const },
  { to: '/audit', label: 'Audit Logs' },
];

export default function QualityAuditShell() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { can } = useAuth();

  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: ['data-quality-summary'],
      queryFn: fetchDataQualitySummary,
      staleTime: 1000 * 60 * 2,
    });

    queryClient.prefetchQuery({
      queryKey: ['kobo-unmatched'],
      queryFn: fetchUnmatchedRecords,
      staleTime: 1000 * 60 * 2,
    });

    if (can('reprocess_kobo')) {
      void queryClient.prefetchQuery({
        queryKey: ['kobo_submissions'],
        queryFn: fetchSubmissions,
        staleTime: 1000 * 60 * 2,
      });
    }

    queryClient.prefetchQuery({
      queryKey: ['audit_logs_all'],
      queryFn: fetchAllAuditLogs,
      staleTime: 1000 * 60 * 2,
    });
  }, [can, queryClient]);

  return (
    <div className="page dq-page">
      <main className="dq-main">
        <header className="dq-header">
          <div>
            <h1 className="dq-title">Quality & Audit</h1>
            <p className="dq-subtitle">Review data quality, Kobo processing, merge duplicates, and audit activity.</p>
          </div>
        </header>

        <nav className="dq-admin-tabs" aria-label="Quality and audit sections">
          {tabs.filter((tab) => !tab.capability || can(tab.capability)).map((tab) => (
            <Link
              key={tab.to}
              className={`dq-admin-tab${location.pathname === tab.to ? ' dq-admin-tab--active' : ''}`}
              to={tab.to}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <Outlet />
      </main>
    </div>
  );
}
