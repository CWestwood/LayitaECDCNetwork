// src/features/practitioners/index.tsx

import { useMemo, useCallback, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { resolveGroupColor, resolveGroupNameShortForm } from "../../lib/Groupcolors";
import { TRAINING_FILTERS } from "../../lib/Trainingfilters";
import { usePractitioners, useGlobalVisitStats } from "./api/usePractitioners";
import { Practitioner } from "./types";
import PractitionerRow  from "./PractitionerRow";
import PractitionerCard from "./PractitionerCard";
import {DetailPanel, DetailEmpty} from "./DetailPanel";
import {
  daysSince,
  Icon,
  Icons,
  GridIcon,
  ListIcon,
} from "./_components";
import "../../styles/practitioners.css";
import { QueryState } from "../../app/QueryState";

// ─── ../lib ────────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { key: "name_asc",       label: "Name (A–Z)"         },
  { key: "name_desc",      label: "Name (Z–A)"         },
  { key: "ecdc_asc",       label: "ECDC (A–Z)"         },
  { key: "ecdc_desc",      label: "ECDC (Z–A)"         },
  {key : "area_asc",        label: "Area (A–Z)"         },
  {key : "area_desc",       label: "Area (Z–A)"         },
  { key: "visit_recent",   label: "Recently visited"  },
  { key: "visit_oldest",   label: "Longest overdue"   },
 // { key: "training_most",  label: "Most training"     },
 // { key: "training_least", label: "Least training"    },
] as const;

type SortKey = typeof SORT_OPTIONS[number]["key"];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Practitioners() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected,        setSelected]        = useState<Practitioner | null>(null);
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set());
  const [search,          setSearch]          = useState("");
  const [sortKey,         setSortKey]         = useState<SortKey>("name_asc");
  const [viewMode] = useState<"list" | "grid">("list");
  const [activeGroups,    setActiveGroups]    = useState<string[]>([]);
  const [activeTraining,  setActiveTraining]  = useState<string[]>([]);
  const [trainingMode,    setTrainingMode]    = useState<"has" | "needs">("has");
  const [viewSelectedOnly, setViewSelectedOnly] = useState(false);
  const [hasProcessedUrl, setHasProcessedUrl] = useState(false);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: practitioners = [], isLoading: pracLoading, error: practitionersError, refetch: refetchPractitioners } = usePractitioners();
  const { data: globalVisits = [], isLoading: visitsLoading, error: visitsError, refetch: refetchVisits } = useGlobalVisitStats();

  const loading = pracLoading || visitsLoading;

  // Build lastVisitMap from the lightweight global stats query
  const lastVisitMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of globalVisits) {
      if (v.practitioner_id && v.date && !map.has(v.practitioner_id)) {
        map.set(v.practitioner_id, v.date);
      }
    }
    return map;
  }, [globalVisits]);

  useEffect(() => {
    if (hasProcessedUrl) return;

    const pParam = searchParams.get('practitioners');
    const eParam = searchParams.get('ecdcs');

    if (!pParam && !eParam) {
      setHasProcessedUrl(true);
      return;
    }

    if (eParam && pracLoading) {
      return; // Wait for practitioners to load before matching ecdcs
    }

    const newSearchParams = new URLSearchParams(searchParams);
    const idsToSelect = new Set<string>();

    if (pParam) {
      pParam.split(',').forEach(id => idsToSelect.add(id));
      newSearchParams.delete('practitioners');
    }

    if (eParam) {
      const ecdcIds = new Set(eParam.split(','));
      practitioners.forEach(p => {
        const ecdcId = p.ecdc?.id;
        if (ecdcId && ecdcIds.has(String(ecdcId))) {
          idsToSelect.add(String(p.id));
        }
      });
      newSearchParams.delete('ecdcs');
    }

    if (idsToSelect.size > 0) {
      setSelectedIds(idsToSelect);
      setViewSelectedOnly(true);
    }

    setSearchParams(newSearchParams, { replace: true });
    setHasProcessedUrl(true);
  }, [searchParams, setSearchParams, practitioners, pracLoading, hasProcessedUrl]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const allGroups = useMemo(() => {
    const seen = new Set<string>();
    return practitioners
      .map((p) => p.group?.group_name)
      .filter((g): g is string => !!g && !seen.has(g) && !!seen.add(g))
      .sort((a, b) => a.localeCompare(b));
  }, [practitioners]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();

    const list = practitioners.filter((p) => {
      const matchSearch   = !q
        || p.name?.toLowerCase().includes(q)
        || p.ecdc?.name?.toLowerCase().includes(q)
        || p.group?.group_name?.toLowerCase().includes(q);
      const matchGroup    = activeGroups.length === 0 || activeGroups.includes(p.group?.group_name ?? "");
      const matchTraining = activeTraining.length === 0 || activeTraining.every((k) => {
        const hasTraining = (p.training as Record<string, boolean> | null)?.[k] === true;
        return trainingMode === "has" ? hasTraining : !hasTraining;
      });
      const matchSelected = !viewSelectedOnly || selectedIds.has(p.id);
      return matchSearch && matchGroup && matchTraining && matchSelected;
    });

    return [...list].sort((a, b) => {
      switch (sortKey) {
        case "name_asc":       return (a.name || "").localeCompare(b.name || "");
        case "name_desc":      return (b.name || "").localeCompare(a.name || "");
        case "visit_recent":   return daysSince(lastVisitMap.get(a.id)) - daysSince(lastVisitMap.get(b.id));
        case "visit_oldest":   return daysSince(lastVisitMap.get(b.id)) - daysSince(lastVisitMap.get(a.id));
        case "ecdc_asc":       return (a.ecdc?.name || "").localeCompare(b.ecdc?.name || "");
        case "ecdc_desc":      return (b.ecdc?.name || "").localeCompare(a.ecdc?.name || "");
        case "area_asc":       return (a.ecdc?.area || "").localeCompare(b.ecdc?.area || "");
        case "area_desc":      return (b.ecdc?.area || "").localeCompare(a.ecdc?.area || "");
        default: return 0;
      }
    });
  }, [practitioners, search, activeGroups, activeTraining, trainingMode, sortKey, lastVisitMap, viewSelectedOnly, selectedIds]);

  const stats = useMemo(() => ({
    total:   practitioners.length,
    showing: filtered.length,
    onTrack: filtered.filter((p) => daysSince(lastVisitMap.get(p.id)) <= 180).length,
    overdue: filtered.filter((p) => {
      const d = daysSince(lastVisitMap.get(p.id));
      return d > 180 && d !== Infinity;
    }).length,
    never: filtered.filter((p) => !lastVisitMap.has(p.id)).length,
  }), [practitioners, filtered, lastVisitMap]);

  // ── Event handlers ────────────────────────────────────────────────────────
  const toggleGroup    = useCallback((g: string) =>
    setActiveGroups((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]), []);

  const toggleTraining = useCallback((k: string) =>
    setActiveTraining((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]), []);

  const clearFilters   = useCallback(() => { 
    setActiveGroups([]); 
    setActiveTraining([]); 
    setTrainingMode("has"); 
    setViewSelectedOnly(false);
  }, []);

  const handleSelect   = useCallback((p: Practitioner) =>
    setSelected((prev) => prev?.id === p.id ? null : p), []);

  const toggleMultiSelect = useCallback((id: string, e: React.SyntheticEvent) => {
    e.stopPropagation(); // Prevent row click from opening the detail panel
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const strId = String(id);
      next.has(strId) ? next.delete(strId) : next.add(strId);
      return next;
    });
  }, []);

  const anyFilters = activeGroups.length > 0 || activeTraining.length > 0 || viewSelectedOnly;

  const handleViewOnMap = () => {
    // Extract unique ECDC IDs from the selected practitioners
    const ecdcIds = Array.from(selectedIds)
      .map(id => {
        const prac = practitioners.find(p => String(p.id) === String(id));
        return prac?.ecdc?.id;
      })
      .filter(Boolean);
    
    const uniqueEcdcIds = Array.from(new Set(ecdcIds));
    
    if (uniqueEcdcIds.length > 0) {
      navigate(`/map?ecdcs=${uniqueEcdcIds.join(',')}`);
    } else {
      alert("None of the selected practitioners are assigned to an ECDC.");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p2-page">

      <div className="p2-main">

        {/* ── Top bar ── */}
        <header className="p2-topbar">
          <h1 className="p2-topbar__title">Practitioners</h1>

          {selectedIds.size > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginLeft: '16px' }}>
              <button 
                className={`p2-chip ${viewSelectedOnly ? "p2-chip--active" : ""}`} 
                onClick={() => setViewSelectedOnly(!viewSelectedOnly)}
              >
                {viewSelectedOnly ? "Showing selected" : "Show selected only"}
              </button>
              <button className="p2-chip p2-chip--active" onClick={handleViewOnMap} style={{ background: '#3b82f6', color: 'white', border: 'none' }}>
                View {selectedIds.size} on Map
              </button>
            </div>
          )}

          <div className="p2-topbar__controls">
            <div className="p2-search">
              <svg className="p2-search__icon" width="13" height="13" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                className="p2-search__input"
                placeholder="Search name, ECDC, group…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button className="p2-search__clear" onClick={() => setSearch("")}>
                  <Icon d={Icons.x} size={11} />
                </button>
              )}
            </div>

            <select
              className="p2-select"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              aria-label="Sort by"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>

            {/*<div className="p2-view-toggle" role="group" aria-label="View mode">
              <button
                className={`p2-view-btn ${viewMode === "list" ? "p2-view-btn--active" : ""}`}
                onClick={() => setViewMode("list")}
                title="List view"
              ><ListIcon /></button>
              <button
                className={`p2-view-btn ${viewMode === "grid" ? "p2-view-btn--active" : ""}`}
                onClick={() => setViewMode("grid")}
                title="Grid view"
              ><GridIcon /></button>
            </div> */}
          </div>
        </header>

        {/* ── Filter bar ── */}
        <div className="p2-filters" role="toolbar" aria-label="Filters">
          <span className="p2-filters__label">Groups</span>

          {allGroups.map((g) => {
            const c = resolveGroupColor(g);
            return (
              <button
                key={g}
                className={`p2-chip ${activeGroups.includes(g) ? "p2-chip--active" : ""}`}
                onClick={() => toggleGroup(g)}
                style={{ "--chip-color": c.fill } as React.CSSProperties}
              >
                <span className="p2-chip__dot" style={{ background: c.fill }} />
                {resolveGroupNameShortForm(g)}
              </button>
            );
          })}
          </div>

          <div className="p2-filters" role="toolbar" aria-label="Filters">
          
          <span className="p2-filters__label">Training</span>

          <div className="p2-segment-toggle">
            <button
              className={`p2-segment-btn ${trainingMode === "has" ? "p2-segment-btn--active" : ""}`}
              onClick={() => setTrainingMode("has")}
            >
              Has had
            </button>
            <button
              className={`p2-segment-btn ${trainingMode === "needs" ? "p2-segment-btn--active" : ""}`}
              onClick={() => setTrainingMode("needs")}
            >
              Needs
            </button>
          </div>

          {TRAINING_FILTERS.map((f) => (
            <button
              key={f.key}
              className={`p2-chip ${activeTraining.includes(f.key) ? "p2-chip--active" : ""}`}
              onClick={() => toggleTraining(f.key)}
            >
              {f.label}
            </button>
          ))}

          {anyFilters && (
            <button className="p2-chip p2-chip--clear" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>

        {/* ── Stats strip ── */}
        <div className="p2-stats" role="region" aria-label="Summary statistics">
          {([
            { value: stats.total,   label: "Total",          color: null      },
            { value: stats.showing, label: "Showing",        color: null      },
            { value: stats.onTrack, label: "On track",       color: "success" },
            { value: stats.overdue, label: "Overdue (>6mo)", color: "warning" },
            { value: stats.never,   label: "Never visited",  color: "danger"  },
          ] as const).map(({ value, label, color }) => (
            <div key={label} className="p2-stat">
              <div className="p2-stat__label">{label}</div>
              <div className={`p2-stat__value ${color ? `p2-stat__value--${color}` : ""}`}>
                {value}
              </div>
              
            </div>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="p2-body">

          {/* List / grid panel */}
          <div className={`p2-list-panel ${selected ? "" : "p2-list-panel--full"}`}>
            {loading ? (
              <div className="p2-loading">
                <div className="p2-spinner" />
                Loading practitioners…
              </div>
            ) : practitionersError || visitsError ? (
              <QueryState loading={false} error={practitionersError ?? visitsError} onRetry={() => { void Promise.all([refetchPractitioners(), refetchVisits()]); }} />
            ) : filtered.length === 0 ? (
              <div className="p2-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <p>No practitioners match your current filters.</p>
                {anyFilters && (
                  <button className="p2-chip p2-chip--clear" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </div>
            ) : viewMode === "list" ? (
              <>
                <div className="p2-list-header">
                  <div></div> {/* Indicator spacer */}
                  <div></div> {/* Checkbox spacer */}
                  <div>Name / Group</div>
                  <div>ECDC / Area</div>
                  <div>Chief / Headman</div>
                  <div>Last Interaction</div>
                  <div>Training</div>
                  <div># of Children</div>
                  <div></div> {/* Flags spacer */}
                </div>
                <div className="p2-list-scroll">
                  {filtered.map((p) => (
                    <PractitionerRow
                      key={p.id}
                      p={p}
                      selected={selected}
                      lastVisit={lastVisitMap.get(p.id)}
                      onClick={() => handleSelect(p)}
                      isMultiSelected={selectedIds.has(String(p.id))}
                      onMultiSelectToggle={(e) => toggleMultiSelect(String(p.id), e)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="p2-grid-scroll">
                <div className="p2-grid">
                  {filtered.map((p) => (
                    <PractitionerCard
                      key={p.id}
                      p={p}
                      selected={selected}
                      lastVisit={lastVisitMap.get(p.id)}
                      onClick={() => handleSelect(p)}
                      isMultiSelected={selectedIds.has(String(p.id))}
                      onMultiSelectToggle={(e) => toggleMultiSelect(String(p.id), e)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Detail panel */}
          <div className={`p2-detail-panel ${selected ? "p2-detail-panel--open" : ""}`}>
            {selected
              ? <DetailPanel p={selected} onClose={() => setSelected(null)} />
              : <DetailEmpty />
            }
          </div>

        </div>
      </div>
    </div>
  );
}
