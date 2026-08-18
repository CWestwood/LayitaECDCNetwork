import { useMemo, useState } from "react";
import { useClientErrors, useReprocessSubmission, useSubmissions } from "../api/useSubmissions";
import "../../../styles/practitioners.css";
import "../../../styles/deleted-records.css";
import { QueryState } from "../../../app/QueryState";

function StatusBadge({ state }: { state: string }) {
  let colorClass = "p2-visit-badge--none";
  if (state === "success") colorClass = "p2-visit-badge--ok";
  if (state === "partial") colorClass = "p2-visit-badge--warning";
  if (state === "failed") colorClass = "p2-visit-badge--danger";
  if (state === "pending") colorClass = "p2-visit-badge--warning";
  return <span className={`p2-visit-badge ${colorClass}`} style={{ textTransform: "capitalize" }}>{state}</span>;
}

function toggleSet(current: Set<string>, id: string) {
  const next = new Set(current);
  next.has(id) ? next.delete(id) : next.add(id);
  return next;
}

export default function KoboMonitor() {
  const { data: submissions = [], isLoading, error, refetch } = useSubmissions();
  const { data: clientErrors = [], error: clientErrorsError, refetch: refetchClientErrors } = useClientErrors();
  const reprocessSubmission = useReprocessSubmission();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [rawExpanded, setRawExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return submissions;
    return submissions.filter((submission) =>
      submission.practitioner_name?.toLowerCase().includes(q) ||
      submission.ecdc_name?.toLowerCase().includes(q) ||
      submission.data_capturer?.toLowerCase().includes(q) ||
      submission.outreach_type?.toLowerCase().includes(q) ||
      submission.outreach_date?.includes(q) ||
      submission.processing_state.toLowerCase().includes(q) ||
      submission.instance_id.toLowerCase().includes(q)
    );
  }, [submissions, search]);

  return (
    <div className="dq-content-panel">
      <header className="p2-topbar">
        <h1 className="p2-topbar__title">Submission Monitor</h1>
        <p className="p2-topbar__subtitle">Recent KoboToolbox payload processing</p>
        <div className="p2-topbar__controls">
          <div className="p2-search">
            <svg className="p2-search__icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input className="p2-search__input" placeholder="Search practitioner, ECDC, type, date or state..." value={search} onChange={(event) => setSearch(event.target.value)} />
            {search && (
              <button className="p2-search__clear" onClick={() => setSearch("")} aria-label="Clear search">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="p2-body" style={{ flexDirection: "column", padding: "24px", overflowY: "auto" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto", width: "100%" }}>
          <section className="dq-section" aria-labelledby="client-errors-title">
            <div className="dq-section__header">
              <div>
                <h2 id="client-errors-title" className="dq-section__title">Recent application errors</h2>
                <p className="dq-section__subtitle">Sanitized browser failures. Use the correlation ID when reporting a problem.</p>
              </div>
            </div>
            {clientErrorsError ? (
              <QueryState loading={false} error={clientErrorsError} onRetry={() => { void refetchClientErrors(); }} />
            ) : clientErrors.length === 0 ? (
              <div className="p2-empty">No application errors recorded.</div>
            ) : (
              <div className="audit-list">
                {clientErrors.slice(0, 10).map((row) => (
                  <div className="audit-event" key={row.id}>
                    <div className="audit-event__header">
                      <span className="kobo-summary"><strong>{row.event}</strong><span>{row.message}</span><small>{row.route ?? 'Unknown route'} · {row.profile?.name ?? 'Unknown user'}</small></span>
                      <span className="audit-event__when">{new Date(row.created_at).toLocaleString('en-ZA')}<small>{row.correlation_id}</small></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          {isLoading ? (
            <div className="p2-loading"><div className="p2-spinner" /> Loading submissions...</div>
          ) : error ? (
            <QueryState loading={false} error={error} onRetry={() => { void refetch(); }} />
          ) : filtered.length === 0 ? (
            <div className="p2-empty">No submissions match your search.</div>
          ) : (
            <div className="audit-list">
              {filtered.map((submission) => {
                const isOpen = expanded.has(submission.instance_id);
                const isRawOpen = rawExpanded.has(submission.instance_id);
                const submitted = new Date(submission.submitted_at);
                const submittedDate = submitted.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
                const submittedTime = submitted.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
                const visitDate = submission.outreach_date
                  ? new Date(`${submission.outreach_date}T00:00:00`).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })
                  : submittedDate;
                const parentSummary = submission.parents_attending == null
                  ? null
                  : submission.parents_enrolled == null
                    ? `${submission.parents_attending} parents`
                    : `${submission.parents_attending}/${submission.parents_enrolled} parents`;
                const summaryDetails = [
                  submission.outreach_type,
                  parentSummary,
                  submission.children_involved == null ? null : `${submission.children_involved} children`,
                  submission.data_capturer ? `Captured by ${submission.data_capturer}` : null,
                ].filter(Boolean).join(" · ");

                return (
                  <div key={submission.instance_id} className="audit-event">
                    <button className="audit-event__header" onClick={() => setExpanded((current) => toggleSet(current, submission.instance_id))} aria-expanded={isOpen}>
                      <div className="audit-event__left">
                        <StatusBadge state={submission.processing_state} />
                        <span className="kobo-summary">
                          <strong>{submission.practitioner_name || "Unknown practitioner"}</strong>
                          <span>{submission.ecdc_name || "Unknown ECDC"}</span>
                          <small>{summaryDetails || "No visit details available"}</small>
                        </span>
                      </div>
                      <div className="audit-event__right">
                        <span className="audit-event__when">Visit {visitDate}<small>Submitted {submittedDate} · {submittedTime}</small></span>
                        <svg className={`audit-chevron ${isOpen ? "audit-chevron--open" : ""}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="audit-event__fields">
                        <div className="audit-field"><span className="audit-field__name">Instance ID</span><span>{submission.instance_id}</span></div>
                        <div className="audit-field"><span className="audit-field__name">Data Capturer</span><span>{submission.data_capturer || "—"}</span></div>
                        <div className="audit-field"><span className="audit-field__name">Outreach Type</span><span>{submission.outreach_type || "—"}</span></div>
                        <div className="audit-field"><span className="audit-field__name">Parents</span><span>{parentSummary || "—"}</span></div>
                        <div className="audit-field"><span className="audit-field__name">Children involved</span><span>{submission.children_involved || "—"}</span></div>
                        {submission.processing_seconds != null && (
                          <div className="audit-field"><span className="audit-field__name">Processing Time</span><span>{submission.processing_seconds}s</span></div>
                        )}
                        {submission.error_message && (
                          <div className="audit-field" style={{ color: "var(--color-danger)" }}><span className="audit-field__name" style={{ color: "var(--color-danger)" }}>Error</span><span>{submission.error_message}</span></div>
                        )}
                        {submission.warnings && (
                          <div className="audit-field" style={{ color: "var(--color-warning)" }}><span className="audit-field__name" style={{ color: "var(--color-warning)" }}>Warnings</span><pre style={{ margin: 0, fontFamily: "inherit" }}>{submission.warnings}</pre></div>
                        )}
                        <div className="audit-field">
                          <span className="audit-field__name">Admin Action</span>
                          <div className="dq-actions">
                            <button className="la-deleted__btn" onClick={() => setRawExpanded((current) => toggleSet(current, submission.instance_id))}>
                              {isRawOpen ? "Hide raw Kobo data" : "View raw Kobo data"}
                            </button>
                            <button className="la-deleted__btn" disabled={reprocessSubmission.isPending} onClick={() => reprocessSubmission.mutate(submission.instance_id)}>
                              {reprocessSubmission.isPending ? "Reprocessing..." : "Reprocess Submission"}
                            </button>
                          </div>
                        </div>
                        {isRawOpen && (
                          <div className="kobo-raw" aria-label={`Raw Kobo data for ${submission.instance_id}`}><pre>{JSON.stringify(submission.payload, null, 2)}</pre></div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
