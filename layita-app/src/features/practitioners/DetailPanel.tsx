// src/features/practitioners/DetailPanel.tsx

import { useState, useMemo } from "react";
import { resolveGroupColor } from "../../lib/Groupcolors";
import { TRAINING_FILTERS } from "../../lib/Trainingfilters";
import { usePractitionerVisits } from "./api/usePractitioners";
import { useAuditLogs } from "../layita/api/useAudit";
import { useDeletePractitioner } from "./api/useDeletePractitioner";
import { Practitioner } from "./types";
import { AdminSoftDeleteButton } from "../layita/components/AdminSoftDeleteButton";
import {
  fmtDate,
  daysSince,
  urgency,
  trainingCount,
  Icon,
  Icons,
  FlagPill,
} from "./_components";
import PractitionerEditForm from "./PractitionerEditForm";

// ─── Constants ────────────────────────────────────────────────────────────────

const VISIT_DISPLAY_LIMIT = 6;

const FIELD_LABELS: Record<string, string> = {
  name:            "Name",
  contact_number1: "Primary contact",
  contact_number2: "Secondary contact",
  has_whatsapp:    "WhatsApp",
  dsd_funded:      "DSD Funded",
  dsd_registered:  "DSD Registered",
  ecdc_id:         "ECDC",
  group_id:        "Group",
  group:           "Group name",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (val: string | null) => {
  if (val === null || val === undefined || val === "")
    return <em className="audit-nil">empty</em>;
  if (val === "true")  return <span className="audit-bool audit-bool--yes">Yes</span>;
  if (val === "false") return <span className="audit-bool audit-bool--no">No</span>;
  return <span>{val}</span>;
};

function groupRows(rows: ReturnType<typeof useAuditLogs>["data"]) {
  const map = new Map<string, { meta: (typeof rows)[0]; fields: typeof rows }>();
  for (const row of rows ?? []) {
    const key = `${row.changed_at.slice(0, 19)}_${row.changed_by_name ?? "system"}`;
    if (!map.has(key)) map.set(key, { meta: row, fields: [] });
    map.get(key)!.fields.push(row);
  }
  return Array.from(map.values());
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  p: Practitioner;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DetailPanel({ p, onClose }: Props) {
  const [showAllVisits, setShowAllVisits] = useState(false);
  const [expanded, setExpanded]           = useState<Set<string>>(new Set());
  const [editing, setEditing]             = useState(false);

  const { data: visits = [],    isLoading: visitsLoading } = usePractitionerVisits(p.id);
  const { data: auditRows = [], isLoading: auditLoading  } = useAuditLogs({
    recordId:  p.id,
    tableName: "practitioners",
  });
  const { mutate: deletePractitioner, isPending: deletePending } = useDeletePractitioner();

  const color         = resolveGroupColor(p.group?.group_name);
  const lastVisitDate = visits[0]?.date;
  const days          = daysSince(lastVisitDate);
  const { level, label: visitLabel } = urgency(days);
  const count         = trainingCount(p);
  const visibleVisits = showAllVisits ? visits : visits.slice(0, VISIT_DISPLAY_LIMIT);
  const mappingVisits = visits.filter(v => v.outreach_type === "ECDC Mapping");

  // Bug 1 fixed: useMemo was missing its callback — was `useMemo([rows])`
  const meaningful = useMemo(
    () => auditRows.filter(r => r.field_name !== "updated_at"),
    [auditRows]
  );

  const groups = useMemo(() => groupRows(meaningful), [meaningful]);

  const toggle = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  if (editing) {
    return <PractitionerEditForm p={p} onDone={() => setEditing(false)} onSaved={() => setEditing(false)} />;
  }

  return (
    <div className="p2-detail">

      {/* ── Hero header ── */}
      <div className="p2-detail__hero" style={{ "--group-color": color.fill } as React.CSSProperties}>
        <div className="p2-detail__hero-bar" />

        <div className="p2-detail__hero-inner">
          <div className="p2-detail__avatar" style={{ background: color.glow, color: color.fill }}>
            {(p.name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div className="p2-detail__hero-text">
            <h2 className="p2-detail__name">{p.name || "—"}</h2>
            {p.group?.group_name && (
              <div className="p2-detail__group" style={{ color: color.fill }}>
                {p.group.group_name}
              </div>
            )}
          </div>
          <AdminSoftDeleteButton 
            onConfirm={() => deletePractitioner(p.id, { onSuccess: onClose })} 
            isPending={deletePending} 
            label="Delete" 
          />
      <button className="p2-detail__editor" onClick={() => setEditing(true)}>
            <Icon d={Icons.pencil} size={14} />
          </button>
          <button className="p2-detail__close" onClick={onClose} aria-label="Close">
            <Icon d={Icons.close} size={14} />
          </button>
        </div>

        {/* Meta grid */}
        <div className="p2-detail__meta">
          <div className="p2-detail__meta-item">
            <div className="p2-detail__meta-label">ECDC</div>
            <div className="p2-detail__meta-value">{p.ecdc?.name || "—"}</div>
            {p.ecdc?.area && <div className="p2-detail__meta-sub">{p.ecdc.area}</div>}
          </div>

          <div className="p2-detail__meta-item">
            <div className="p2-detail__meta-label">Last Interaction</div>
            <div className={`p2-detail__meta-value p2-detail__meta-value--${level}`}>
              {visitsLoading ? "…" : days === Infinity ? "Never" : fmtDate(lastVisitDate)}
            </div>
            <div className={`p2-detail__meta-sub p2-detail__meta-sub--${level}`}>
              {visitsLoading ? "" : visitLabel}
            </div>
          </div>

          {p.contact_number1 && (
            <div className="p2-detail__meta-item">
              <div className="p2-detail__meta-label">Contact</div>
              <div className="p2-detail__meta-value p2-detail__meta-contact">
                <Icon d={Icons.phone} size={11} />
                {p.contact_number1}
              </div>
              {p.contact_number2 && (
                <div className="p2-detail__meta-sub p2-detail__meta-contact">
                  <Icon d={Icons.phone} size={10} />
                  {p.contact_number2}
                </div>
              )}
            </div>
          )}

          <div className="p2-detail__meta-item">
            <div className="p2-detail__meta-label">Visits on record</div>
            <div className="p2-detail__meta-value">
              {visitsLoading ? "…" : visits.length}
            </div>
          
            <div className="p2-detail__meta-item">
              <div className="p2-detail__meta-label">Mapping Comments</div>
              <div className="p2-visit__comment ">
                {mappingVisits.find(v => v.comments)?.comments || "No comments"}
              </div>
            </div>
          </div>
        </div>

        {/* Flag pills */}
        <div className="p2-detail__flags">
          <FlagPill active={!!p.has_whatsapp}>WhatsApp</FlagPill>
          <FlagPill active={!!p.dsd_funded}>DSD Funded</FlagPill>
          <FlagPill active={!!p.dsd_registered}>DSD Registered</FlagPill>
        </div>
      </div>

      {/* ── Training ── */}
      <section className="p2-detail__section">
        <div className="p2-detail__section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
            <path d="M6 12v5c3 3 9 3 12 0v-5" />
          </svg>
          Training — {count}/{TRAINING_FILTERS.length} completed
        </div>
        <div className="p2-detail__training-grid">
          {TRAINING_FILTERS.map((f) => {
            const has = p.training?.[f.key] === true;
            return (
              <div
                key={f.key}
                className={`p2-training-item ${has ? "p2-training-item--has" : "p2-training-item--no"}`}
              >
                <div className="p2-training-item__icon">
                  {has ? <Icon d={Icons.check} size={10} /> : <Icon d={Icons.x} size={9} />}
                </div>
                {f.label}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Visit history ── */}
      <section className="p2-detail__section">
        <div className="p2-detail__section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8"  y1="2" x2="8"  y2="6" />
            <line x1="3"  y1="10" x2="21" y2="10" />
          </svg>
          Visit history — {visitsLoading ? "…" : `${visits.length} record${visits.length !== 1 ? "s" : ""}`}
        </div>

        {visitsLoading ? (
          <div className="p2-loading">
            <div className="p2-spinner" /> Loading visits…
          </div>
        ) : visits.length === 0 ? (
          <p className="p2-detail__empty">No visits recorded yet.</p>
        ) : (
          <>
            <div className="p2-visits">
              {visibleVisits.map((v) => {
                const vdays = daysSince(v.date);
                const { level: vl } = urgency(vdays);
                const details = [
                  v.parents_trained && `${v.parents_trained} parents trained`,
                  v.children_books  && `${v.children_books} books to children`,
                  v.transport_type  && `${v.transport_type}${v.transport_km ? ` · ${v.transport_km}km` : ""}`,
                  v.transport_cost  && `R${v.transport_cost}`,
                ].filter(Boolean) as string[];

                return (
                  <div key={v.id} className="p2-visit">
                    <div className="p2-visit__left">
                      <div className="p2-visit__date">{fmtDate(v.date) || "—"}</div>
                      <div className={`p2-visit__line p2-visit__line--${vl}`} />
                    </div>
                    <div className="p2-visit__right">
                      <div className="p2-visit__top">
                        <span className="p2-visit__type">{v.outreach_type || "Visit"}</span>
                        {v.outreach_happened && v.outreach_happened.toLowerCase() !== "yes" && (
                          <span className="p2-visit__status p2-visit__status--warn">
                            {v.outreach_happened}
                          </span>
                        )}
                      </div>
                      {details.length > 0 && (
                        <div className="p2-visit__details">{details.join(" · ")}</div>
                      )}
                      {v.comments && (
                        <div className="p2-visit__comment">"{v.comments}"</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {visits.length > VISIT_DISPLAY_LIMIT && (
              <button
                className="p2-show-more"
                onClick={() => setShowAllVisits((v) => !v)}
              >
                {showAllVisits
                  ? "Show fewer visits"
                  : `Show ${visits.length - VISIT_DISPLAY_LIMIT} more visits`}
              </button>
            )}
          </>
        )}
      </section>

      {/* ── Change history ── */}
      <section className="p2-detail__section">
        <div className="p2-detail__section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          {/* Bug 2 fixed: duplicate title lines removed, using auditLoading not isLoading */}
          Change history — {auditLoading ? "…" : `${groups.length} edit${groups.length !== 1 ? "s" : ""}`}
        </div>

        {auditLoading ? (
          <div className="p2-loading"><div className="p2-spinner" /> Loading history…</div>
        ) : groups.length === 0 ? (
          <p className="p2-detail__empty">No edits recorded yet.</p>
        ) : (
          <div className="audit-list">
            {groups.map(({ meta, fields }) => {
              // Bug 3 fixed: key must match the key used in groupRows,
              // otherwise expanded state never matches and nothing opens
              const key    = `${meta.changed_at.slice(0, 19)}_${meta.changed_by_name ?? "system"}`;
              const isOpen = expanded.has(key);
              const d      = new Date(meta.changed_at);
              const dateStr = d.toLocaleDateString("en-ZA", {
                day: "2-digit", month: "short", year: "numeric",
              });
              const timeStr = d.toLocaleTimeString("en-ZA", {
                hour: "2-digit", minute: "2-digit",
              });

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
                        changed {fields.length} field{fields.length !== 1 ? "s" : ""}
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
      </section>

    </div>
  );
}

// ─── Empty state (no selection) ───────────────────────────────────────────────

export function DetailEmpty() {
  return (
    <div className="p2-detail p2-detail--empty">
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
        <circle cx="9" cy="7" r="4" />
        <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        <path d="M21 21v-2a4 4 0 0 0-3-3.87" />
      </svg>
      <p>Select a practitioner to view their profile</p>
    </div>
  );
}