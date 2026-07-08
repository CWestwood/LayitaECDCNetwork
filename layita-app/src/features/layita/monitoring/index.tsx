import { useMemo, useState } from "react";
import { useReprocessSubmission, useSubmissions } from "../api/useSubmissions";
import "../../../styles/practitioners.css";
import "../../../styles/deleted-records.css";

function StatusBadge({ state }: { state: string }) {
  let colorClass = "p2-visit-badge--none";
  if (state === "success") colorClass = "p2-visit-badge--ok";
  if (state === "partial") colorClass = "p2-visit-badge--warning";
  if (state === "failed")  colorClass = "p2-visit-badge--danger";
  if (state === "pending") colorClass = "p2-visit-badge--warning";

  return (
    <span className={`p2-visit-badge ${colorClass}`} style={{ textTransform: "capitalize" }}>
      {state}
    </span>
  );
}

export default function KoboMonitor() {
  const { data: submissions = [], isLoading } = useSubmissions();
  const reprocessSubmission = useReprocessSubmission();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return submissions;
    
    return submissions.filter((s) => 
      s.practitioner_name?.toLowerCase().includes(q) ||
      s.ecdc_name?.toLowerCase().includes(q) ||
      s.data_capturer?.toLowerCase().includes(q) ||
      s.processing_state.toLowerCase().includes(q) ||
      s.instance_id.toLowerCase().includes(q)
    );
  }, [submissions, search]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
      <div className="dq-content-panel">
        <header className="p2-topbar">
          <h1 className="p2-topbar__title">Submission Monitor</h1>
          <p className="p2-topbar__subtitle">Recent KoboToolbox payload processing</p>

          <div className="p2-topbar__controls">
            <div className="p2-search">
              <svg className="p2-search__icon" width="13" height="13" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                className="p2-search__input"
                placeholder="Search practitioner, ECDC, state..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button className="p2-search__clear" onClick={() => setSearch("")}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="p2-body" style={{ flexDirection: "column", padding: "24px", overflowY: "auto" }}>
          <div style={{ maxWidth: "1000px", margin: "0 auto", width: "100%" }}>
            {isLoading ? (
              <div className="p2-loading"><div className="p2-spinner" /> Loading submissions…</div>
            ) : filtered.length === 0 ? (
              <div className="p2-empty">No submissions match your search.</div>
            ) : (
              <div className="audit-list">
                {filtered.map(sub => {
                  const isOpen = expanded.has(sub.instance_id);
                  const d = new Date(sub.submitted_at);
                  const dateStr = d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
                  const timeStr = d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });

                  return (
                    <div key={sub.instance_id} className="audit-event">
                      <button
                        className="audit-event__header"
                        onClick={() => toggle(sub.instance_id)}
                        aria-expanded={isOpen}
                      >
                        <div className="audit-event__left">
                          <StatusBadge state={sub.processing_state} />
                          <span className="audit-event__who" style={{ marginLeft: 8 }}>
                            {sub.practitioner_name || "Unknown Practitioner"}
                          </span>
                          <span className="audit-event__changed">
                            at {sub.ecdc_name || "Unknown ECDC"}
                          </span>
                        </div>
                        <div className="audit-event__right">
                          <span className="audit-event__when">{dateStr} · {timeStr}</span>
                          <svg
                            className={`audit-chevron ${isOpen ? "audit-chevron--open" : ""}`}
                            width="12" height="12" viewBox="0 0 24 24"
                            fill="none" stroke="currentColor" strokeWidth="2.5"
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="audit-event__fields">
                          <div className="audit-field">
                            <span className="audit-field__name">Instance ID</span>
                            <span className="audit-field__new">{sub.instance_id}</span>
                          </div>
                          <div className="audit-field">
                            <span className="audit-field__name">Data Capturer</span>
                            <span className="audit-field__new">{sub.data_capturer || "—"}</span>
                          </div>
                          <div className="audit-field">
                            <span className="audit-field__name">Outreach Type</span>
                            <span className="audit-field__new">{sub.outreach_type || "—"}</span>
                          </div>
                          {sub.processing_seconds != null && (
                            <div className="audit-field">
                              <span className="audit-field__name">Processing Time</span>
                              <span className="audit-field__new">{sub.processing_seconds}s</span>
                            </div>
                          )}
                          {sub.error_message && (
                            <div className="audit-field" style={{ color: "var(--color-danger)" }}>
                              <span className="audit-field__name" style={{ color: "var(--color-danger)" }}>Error</span>
                              <span>{sub.error_message}</span>
                            </div>
                          )}
                          {sub.warnings && (
                            <div className="audit-field" style={{ color: "var(--color-warning)" }}>
                              <span className="audit-field__name" style={{ color: "var(--color-warning)" }}>Warnings</span>
                              <pre style={{ margin: 0, fontFamily: "inherit" }}>{sub.warnings}</pre>
                            </div>
                          )}
                          <div className="audit-field">
                            <span className="audit-field__name">Admin Action</span>
                            <button
                              className="la-deleted__btn"
                              disabled={reprocessSubmission.isPending}
                              onClick={() => reprocessSubmission.mutate(sub.instance_id)}
                            >
                              {reprocessSubmission.isPending ? "Reprocessing..." : "Reprocess Submission"}
                            </button>
                          </div>
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
