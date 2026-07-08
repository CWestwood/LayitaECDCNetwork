// src/features/visits/VisitDetail.tsx

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { VisitRow, useRawKoboSubmission } from './api/useVisits';
import { formatLabel } from '../../lib/format';
import { fmtDate, resolveHappened, PencilIcon, PersonIcon, CloseIcon } from './_components';
import VisitEditForm from './VisitEditForm';
import { supabase } from '../auth/supabaseClient';
import { useDeleteVisit } from './api/useDeleteVisit';
import { useAuth } from '../auth/useAuth';

interface Props {
  visit: VisitRow;
  onClose: () => void;
}

function flattenPayload(payload: unknown): Array<[string, string]> {
  if (!payload || typeof payload !== 'object') return [];
  return Object.entries(payload as Record<string, unknown>)
    .map(([key, value]) => [
      key,
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : JSON.stringify(value),
    ])
    .sort(([a], [b]) => a.localeCompare(b));
}

export default function VisitDetail({ visit: v, onClose }: Props) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const hap = resolveHappened(v.outreach_happened);
  const [editing, setEditing] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteVisit = useDeleteVisit();
  const rawKobo = useRawKoboSubmission(showRaw ? v.kobo_instance_id : null);
  const rawRows = useMemo(() => flattenPayload(rawKobo.data?.payload), [rawKobo.data]);

  const handleEditClick = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert('Permission denied - you must be logged in to access the edit form.');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const role = profile?.role?.toLowerCase();
    if (role !== 'administrator' && role !== 'manager') {
      alert('Permission denied - only administrators and managers can access the edit form.');
      return;
    }

    setEditing(true);
  };

  if (editing) {
    return <VisitEditForm key={v.id} visit={v} onDone={() => setEditing(false)} onSaved={() => setEditing(false)} />;
  }

  const parentsTrained = Number(v.parents_trained) || 0;
  const parentsEnrolled = Number(v.parents_enrolled) || 0;
  const attendanceRate = parentsEnrolled > 0 ? `${Math.round((parentsTrained / parentsEnrolled) * 100)}%` : null;
  const childrenBooks = v.children_books != null
    ? `${v.children_books}${v.practitioner?.ecdc?.number_children ? ` (${v.practitioner.ecdc.number_children} children)` : ''}`
    : null;

  const metrics = [
    { label: 'Parents trained', val: v.parents_trained },
    { label: 'Parents enrolled', val: v.parents_enrolled },
    { label: 'Attendance rate', val: attendanceRate },
    { label: 'Books to children', val: childrenBooks },
    { label: 'Books per child', val: v.books_per_child },
    { label: 'Books left with practitioner', val: v.books_to_practitioner },
    { label: 'Transport km', val: v.transport_km != null ? `${v.transport_km} km` : null },
    { label: 'Transport cost', val: v.transport_cost != null ? `R${Number(v.transport_cost).toFixed(0)}` : null },
    { label: 'Transport type', val: v.transport_type },
  ];

  return (
    <>
      <div className="ov-detail-hero">
        <div className="ov-detail-hero__head">
          <div>
            <div className="ov-detail-date">{fmtDate(v.date)}</div>
            <span className="ov-detail-type-badge">{formatLabel(v.outreach_type)}</span>
          </div>

          <div className="ov-detail-hero__actions">
            <button className="ov-detail-action-btn" onClick={handleEditClick} title="Edit visit">
              <PencilIcon />
            </button>
            {isAdmin && (
              <button className="ov-detail-action-btn ov-detail-action-btn--danger" onClick={() => setConfirmDelete(true)} title="Delete visit">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            )}
            <button className="ov-detail-action-btn" onClick={onClose} title="Close">
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="ov-detail-prac-name">{v.practitioner?.name || 'Unknown practitioner'}</div>

        <div className="ov-detail-link-row">
          {v.practitioner?.id && (
            <button className="ov-detail-link" onClick={() => navigate(`/practitioners?practitioners=${v.practitioner?.id}`)}>
              View Practitioner
            </button>
          )}
          {v.practitioner?.ecdc?.id && (
            <button className="ov-detail-link" onClick={() => navigate(`/map?ecdcs=${v.practitioner?.ecdc?.id}`)}>
              View ECDC
            </button>
          )}
        </div>

        <div className="ov-detail-source-row">
          <span className="ov-detail-source">Source: {formatLabel(v.source || (v.kobo_instance_id ? 'kobo' : 'manual'))}</span>
          {isAdmin && v.kobo_instance_id && (
            <button className="ov-detail-link" onClick={() => setShowRaw((current) => !current)}>
              {showRaw ? 'Hide Raw Kobo' : 'View Raw Kobo'}
            </button>
          )}
        </div>

        <div className="ov-detail-happened" style={{ background: hap.bg, color: hap.text }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            {v.outreach_happened?.toLowerCase() === 'yes'
              ? <polyline points="20 6 9 17 4 12" />
              : <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>}
          </svg>
          {hap.label}
        </div>

        {v.did_instead && <div className="ov-did-instead">Instead: {v.did_instead}</div>}
      </div>

      {confirmDelete && (
        <div className="ov-detail-section">
          <div className="ov-confirm-row">
            <span>Delete this visit?</span>
            <button
              className="lyt-btn lyt-btn--danger"
              disabled={deleteVisit.isPending}
              onClick={() => {
                deleteVisit.mutate(v.id, { onSuccess: onClose });
                setConfirmDelete(false);
              }}
            >
              {deleteVisit.isPending ? 'Deleting...' : 'Confirm'}
            </button>
            <button className="lyt-btn lyt-btn--secondary" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="ov-detail-section">
        <div className="ov-detail-section__title">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          Metrics
        </div>
        <div className="ov-metric-grid">
          {metrics.map(({ label, val }) => (
            <div key={label} className="ov-metric-card">
              <div className="ov-metric-card__label">{label}</div>
              <div className={`ov-metric-card__value${val == null ? ' ov-metric-card__value--empty' : ''}`}>
                {val ?? '-'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ov-detail-section">
        <div className="ov-detail-section__title">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Logistics
        </div>
        <div className="ov-meta-row">
          <div className="ov-meta-row__label"><PersonIcon /> Data capturer</div>
          <div className="ov-meta-row__value">{v.data_capturer?.name || '-'}</div>
        </div>
        {v.practitioner?.contact_number1 && (
          <div className="ov-meta-row">
            <div className="ov-meta-row__label">Practitioner contact</div>
            <div className="ov-meta-row__value">{v.practitioner.contact_number1}</div>
          </div>
        )}
        {v.practitioner?.ecdc?.name && (
          <div className="ov-meta-row">
            <div className="ov-meta-row__label">ECDC</div>
            <div className="ov-meta-row__value">{v.practitioner.ecdc.name}</div>
          </div>
        )}
      </div>

      {showRaw && (
        <div className="ov-detail-section">
          <div className="ov-detail-section__title">Raw Kobo Data</div>
          {rawKobo.isLoading ? (
            <div className="ov-comment-box">Loading raw submission...</div>
          ) : !rawKobo.data ? (
            <div className="ov-comment-box">No raw Kobo payload found for this visit.</div>
          ) : (
            <div className="ov-raw-table-wrap">
              <table className="ov-raw-table">
                <tbody>
                  {rawRows.map(([key, value]) => (
                    <tr key={key}>
                      <th>{key}</th>
                      <td>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {v.comments && (
        <div className="ov-detail-section">
          <div className="ov-detail-section__title">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Comments
          </div>
          <div className="ov-comment-box">"{v.comments}"</div>
        </div>
      )}
    </>
  );
}
