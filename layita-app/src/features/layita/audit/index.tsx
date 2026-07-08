import { useMemo, useState } from "react";
import { useAllAuditLogs, AuditRow } from "../api/useAudit";
import "../../../styles/practitioners.css";

const FIELD_LABELS: Record<string, string> = {
  name:             "Name",
  contact_number1:  "Primary contact",
  contact_number2:  "Secondary contact",
  has_whatsapp:     "WhatsApp",
  dsd_funded:       "DSD Funded",
  dsd_registered:   "DSD Registered",
  ecdc_id:          "ECDC",
  group_id:         "Group",
  group:            "Group name",
  updated_at:       "Updated at",
};

const fmt = (val: string | null) => {
  if (val === null || val === undefined || val === "") return <em className="audit-nil">empty</em>;
  if (val === "true")  return <span className="audit-bool audit-bool--yes">Yes</span>;
  if (val === "false") return <span className="audit-bool audit-bool--no">No</span>;
  return <span>{val}</span>;
};

// Group flat rows into edit events by truncating changed_at to the second
// We also include record_id in the key to ensure edits to different records at the exact same time stay separate
function groupRows(rows: AuditRow[]) {
  const map = new Map<string, { meta: AuditRow; fields: AuditRow[] }>();
  for (const row of rows) {
    if (row.field_name === "updated_at") continue; // Filter out updated_at noise
    
    const key = `${row.changed_at.slice(0, 19)}_${row.changed_by_name ?? "system"}_${row.record_id}`;
    if (!map.has(key)) map.set(key, { meta: row, fields: [] });
    map.get(key)!.fields.push(row);
  }
  return Array.from(map.values());
}

export default function AuditLogs() {
  const { data: rows = [], isLoading } = useAllAuditLogs();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const groups = useMemo(() => groupRows(rows), [rows]);

  const toggle = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
      <div className="dq-content-panel">
        <header className="p2-topbar">
          <h1 className="p2-topbar__title">Activity & Audit Logs</h1>
          <p className="p2-topbar__subtitle">Tracks changes to the underlying data</p>
        </header>
        

        <div className="p2-body" style={{ flexDirection: "column", padding: "24px", overflowY: "auto" }}>
          <div style={{ maxWidth: "800px", margin: "0 auto", width: "100%" }}>
            {isLoading ? (
              <div className="p2-loading"><div className="p2-spinner" /> Loading activity…</div>
            ) : groups.length === 0 ? (
              <div className="p2-empty">No activity recorded yet.</div>
            ) : (
              <div className="audit-list">
                {groups.map(({ meta, fields }) => {
                  const key = `${meta.changed_at.slice(0, 19)}_${meta.changed_by_name ?? "system"}_${meta.record_id}`;
                  const isOpen = expanded.has(key);
                  const d = new Date(meta.changed_at);
                  const dateStr = d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
                  const timeStr = d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });

                  const tableLabel = meta.table_name === 'practitioners' ? 'Practitioner' :
                                     meta.table_name === 'ecdc_list' ? 'ECDC' :
                                     meta.table_name;

                  return (
                    <div key={key} className="audit-event">
                      <button
                        className="audit-event__header"
                        onClick={() => toggle(key)}
                        aria-expanded={isOpen}
                      >
                        <div className="audit-event__left">
                          <span className="audit-event__who">
                            {meta.changed_by_name ?? "System"}
                          </span>
                          <span className="audit-event__changed">
                            updated {tableLabel}: <strong>{meta.record_name || "Unknown"}</strong>
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
                          {fields.map((f, i) => (
                            <div key={i} className="audit-field">
                              <span className="audit-field__name">
                                {FIELD_LABELS[f.field_name] ?? f.field_name}
                              </span>
                              <span className="audit-field__old">{fmt(f.old_val)}</span>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5" className="audit-arrow">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                              </svg>
                              <span className="audit-field__new">{fmt(f.new_val)}</span>
                            </div>
                          ))}
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
