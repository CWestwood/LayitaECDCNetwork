import { useMemo } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { formatDate, formatLabel } from '../../../lib/format';
import { useAuth } from '../../auth/useAuth';
import { useMyWork, useRequestVisitCorrection } from '../api/useMyWork';
import type { MyPlannedVisit } from '../api/useMyWork';
import '../../../styles/my-work.css';

function PlanList({ rows, empty }: { rows: MyPlannedVisit[]; empty: string }) {
  return rows.length ? <div className="mw-list">{rows.map((visit) => <div key={visit.id} className="mw-row"><div><strong>{visit.practitioner_name}</strong><span>{formatLabel(visit.outreach_type)}{visit.notes ? ` · ${visit.notes}` : ''}</span></div><div className="mw-row__right"><span>{formatDate(visit.scheduled_date)}</span><span>{formatLabel(visit.status)}</span></div></div>)}</div> : <div className="mw-empty">{empty}</div>;
}
export default function MyWorkPage() {
  const { isAdmin, loading: authLoading } = useAuth(); const { data, isLoading, error } = useMyWork();
  const correction = useRequestVisitCorrection();
  const requestCorrection = (visitId: string) => { const description = window.prompt('Describe what should be corrected'); if (description?.trim()) correction.mutate({ visitId, description: description.trim() }); };
  const buckets = useMemo(() => { const today=new Date().toISOString().slice(0,10); const weekEnd=new Date();weekEnd.setDate(weekEnd.getDate()+7);const end=weekEnd.toISOString().slice(0,10);const plans=data?.plannedVisits??[];return { today:plans.filter((row)=>row.scheduled_date===today), overdue:plans.filter((row)=>row.scheduled_date<today), week:plans.filter((row)=>row.scheduled_date>today&&row.scheduled_date<=end) }; }, [data?.plannedVisits]);
  if (!authLoading && isAdmin) return <Navigate to="/dashboard" replace />;
  return <div className="page mw-page"><main className="mw-main"><header className="mw-header"><div><h1 className="mw-title">My Work</h1><p className="mw-subtitle">{data?.staffName ? `Priorities and recent activity for ${data.staffName}.` : 'Your priorities and recent activity.'}</p></div><Link className="lyt-btn" to="/visits">Open visit report</Link></header>
    {isLoading?<div className="mw-empty">Loading your work…</div>:error?<div className="mw-empty" role="alert">Could not load your work. {error.message}</div>:<div className="mw-grid">
      <section className="mw-section mw-section--attention"><h2 className="mw-section__title">Overdue · {buckets.overdue.length}</h2><PlanList rows={buckets.overdue} empty="Nothing overdue." /></section><section className="mw-section"><h2 className="mw-section__title">Today · {buckets.today.length}</h2><PlanList rows={buckets.today} empty="Nothing planned today." /></section><section className="mw-section"><h2 className="mw-section__title">Next 7 days · {buckets.week.length}</h2><PlanList rows={buckets.week} empty="Nothing planned this week." /></section>
      <section className="mw-section"><h2 className="mw-section__title">Recent visits</h2>{data?.recentVisits.length?<div className="mw-list">{data.recentVisits.map((visit)=><div key={visit.id} className="mw-row"><div><strong>{visit.practitioners?.name||'Unknown practitioner'}</strong><span>{formatLabel(visit.outreach_type)}</span></div><div className="mw-row__right"><span>{formatDate(visit.date)}</span><span>{formatLabel(visit.outreach_happened)}</span><button className="lyt-btn" disabled={correction.isPending} onClick={() => requestCorrection(visit.id)}>Request correction</button></div></div>)}</div>:<div className="mw-empty">No recent visits found.</div>}</section>
    </div>}
  </main></div>;
}
