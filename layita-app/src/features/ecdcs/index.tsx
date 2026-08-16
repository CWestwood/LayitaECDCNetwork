// src/features/ecdcMap/index.tsx

import { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { resolveGroupColor, resolveGroupNameShortForm } from '../../lib/Groupcolors';
import { TRAINING_FILTERS } from '../../lib/Trainingfilters';
import { themeColors } from '../../lib/layita_colors';

import { useEcdcsWithPractitioners, EcdcWithPractitioners } from './api/useEcdcsWithPractitioners';
import { useLandmarks } from './api/useLandmarks';
import { useDeleteEcdc } from './api/useDeleteEcdc';
import { useGlobalVisitStats } from '../practitioners/api/usePractitioners';

import { useAppShellFooter } from '../../layouts/AppShell';
import {
  VISIT_PRESETS,
  fmtDate,
  dominantGroupName,
  isPractitionerOverdue,
  createCustomIcon,
  getLandmarkIcon,
  FlyToSelected,
  PhoneIcon,
  MapMarker,
  MapTooltip,
  MapTileLayer,
  CloseIcon,
} from './_components';
import { AdminSoftDeleteButton } from '../layita/components/AdminSoftDeleteButton';
import { useAuth } from '../auth/useAuth';

import '../../styles/shared.css';
import '../../styles/ecdcMap.css';

import { exportReportAsPDF, exportReportAsExcel } from './exportUtils';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ECDCMap() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [selected,        setSelected]        = useState<EcdcWithPractitioners | null>(null);
  const [search,          setSearch]          = useState('');
  const [filtersOpen,     setFiltersOpen]     = useState(false);
  const [activeFilters,   setActiveFilters]   = useState<string[]>([]);
  const [filterMode,      setFilterMode]      = useState<'any' | 'all'>('any');
  const [trainingStatus,  setTrainingStatus]  = useState<'has' | 'needs'>('has');
  const [listVisible,     setListVisible]     = useState(false);
  const [visitFilterOpen, setVisitFilterOpen] = useState(false);
  const [visitPreset,     setVisitPreset]     = useState<string | null>(null);

  // ── Multi-select state ───────────────────────────────────────────────────────
  const [selectMode,      setSelectMode]      = useState(false);
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set());
  const [reportOpen,      setReportOpen]      = useState(false);
  const [viewSelectedOnly, setViewSelectedOnly] = useState(false);

  // ── Data ────────────────────────────────────────────────────────────────────
  const { data: ecdcs    = [], isLoading: ecdcsLoading    } = useEcdcsWithPractitioners();
  const { data: landmarks = [], isLoading: landmarksLoading } = useLandmarks();
  const { mutate: deleteEcdc, isPending: deleteEcdcPending } = useDeleteEcdc();

  const {
    data: globalVisits = [],
    isLoading: visitsLoading,
  } = useGlobalVisitStats();

  const lastVisitMap = useMemo(() => {
    if (!globalVisits.length) return null;
    const map = new Map<string, string>();
    for (const v of globalVisits) {
      if (v.practitioner_id && v.date && !map.has(v.practitioner_id)) map.set(v.practitioner_id, v.date);
    }
    return map;
  }, [globalVisits]);

  const loading = ecdcsLoading || landmarksLoading;

  const drawerBodyRef = useRef<HTMLDivElement>(null);

  // ── URL Query Parsing ────────────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ecdcsParam = params.get('ecdcs');

    if (ecdcsParam) {
      const ids = ecdcsParam.split(',');
      setSelectedIds(new Set(ids));
      setSelectMode(true);
      setListVisible(true);
      setViewSelectedOnly(true);
      
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // ── Legend groups (sidebar footer) ──────────────────────────────────────────
  const legendGroups = useMemo(() => {
    const seen = new Set<string>();
    const groups: string[] = [];
    ecdcs.forEach((e) =>
      e.practitioners?.forEach((p) => {
        const name = p.group?.group_name;
        if (name && !seen.has(name)) { seen.add(name); groups.push(name); }
      })
    );
    return groups.sort((a, b) => a.localeCompare(b));
  }, [ecdcs]);

  // ── Filtered ECDCs ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q   = search.toLowerCase();
    const now = new Date();

    return ecdcs.filter((e) => {
      if (viewSelectedOnly && !selectedIds.has(e.id)) return false;

      const matchesSearch =
        !q ||
        e.name?.toLowerCase().includes(q) ||
        e.area?.toLowerCase().includes(q) ||
        e.practitioners?.some(
          (p) => p.name?.toLowerCase().includes(q) || p.group?.group_name?.toLowerCase().includes(q)
        );

      const matchesTraining =
        activeFilters.length === 0 ||
        e.practitioners?.some((p) => {
          const tr = p.training || {};
          const checkStatus = (k: string) =>
            trainingStatus === 'has' ? tr[k] === true : tr[k] !== true;
          return filterMode === 'all'
            ? activeFilters.every(checkStatus)
            : activeFilters.some(checkStatus);
        });

      const matchesVisit = (() => {
        if (!visitPreset || !lastVisitMap) return true;
        const preset = VISIT_PRESETS.find((p) => p.key === visitPreset);
        if (!preset) return true;
        return e.practitioners?.some((p) =>
          preset.matchFn(lastVisitMap.get(p.id) ?? null, now)
        );
      })();

      return matchesSearch && matchesTraining && matchesVisit;
    });
  }, [ecdcs, search, activeFilters, filterMode, trainingStatus, visitPreset, lastVisitMap, viewSelectedOnly, selectedIds]);

  // ── Selected ECDCs for report ────────────────────────────────────────────────
  const selectedEcdcs = useMemo(
    () => ecdcs.filter((e) => selectedIds.has(e.id)),
    [ecdcs, selectedIds],
  );

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const toggleFilter = (key: string) =>
    setActiveFilters((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );

  const handleSelect = (ecdc: EcdcWithPractitioners) => {
    if (selectMode) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.has(ecdc.id) ? next.delete(ecdc.id) : next.add(ecdc.id);
        if (next.size === 0) setViewSelectedOnly(false);
        return next;
      });
    } else {
      setSelected((prev) => (prev?.id === ecdc.id ? null : ecdc));
    }
  };

  const handleRemove = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      if (next.size === 0) setViewSelectedOnly(false);
      return next;
    });
  };

  const toggleSelectMode = () => {
    setSelectMode((v) => {
      if (v) {
        // turning off — clear selections and close report
        setSelectedIds(new Set());
        setReportOpen(false);
        setViewSelectedOnly(false);
      } else {
        // turning on — close detail card, open list
        setSelected(null);
        setListVisible(true);
      }
      return !v;
    });
  };

  const selectAll = () => setSelectedIds(new Set(filtered.map((e) => e.id)));
  const clearAll  = () => {
    setSelectedIds(new Set());
    setViewSelectedOnly(false);
  };

  const getTrainingTags = (training: Record<string, boolean> | null) => {
    if (!training) return [];
    return TRAINING_FILTERS.filter((f) => training[f.key] === true).map((f) => f.label);
  };

  const handleViewPractitioners = () => {
    const pracIds = selectedEcdcs
      .flatMap(e => e.practitioners?.map(p => p.id) || [])
      .filter(Boolean);
      
    const uniquePracIds = Array.from(new Set(pracIds));
    
    if (uniquePracIds.length > 0) {
      window.location.href = `/practitioners?practitioners=${uniquePracIds.join(',')}`;
    } else {
      alert("No practitioners found for the selected centres.");
    }
  };

  // ── Sidebar legend footer ────────────────────────────────────────────────────
  const legendFooter = useMemo(() => legendGroups.length > 0 ? (
    <>
      <div className="ecdc-legend__heading">Groups</div>
      <div className="ecdc-legend__items">
        {legendGroups.map((name) => {
          const c = resolveGroupColor(name);
          return (
            <div key={name} className="ecdc-legend__item">
              <div className="ecdc-legend__dot" style={{ background: c.fill }} title={name} />
              <span className="ecdc-legend__label">{name}</span>
            </div>
          );
        })}
      </div>
    </>
  ) : null, [legendGroups]);
  useAppShellFooter(legendFooter);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="page">

      <div className="ecdc-map-area">

        {/* Loading overlay */}
        {loading && (
          <div className="ecdc-loading-overlay">
            <div className="spinner spinner--md" />
            Loading centres…
          </div>
        )}

        {/* ── Map ── */}
        <MapContainer
          center={[-32.0006, 28.8986]}
          zoom={11}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <MapTileLayer
            url="https://tiles.stadiamaps.com/tiles/stamen_terrain_background/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://stadiamaps.com">Stadia</a>'
            opacity={0.7}
          />
          <MapTileLayer
            url="https://tiles.stadiamaps.com/tiles/stamen_terrain_lines/{z}/{x}/{y}.png"
            attribution='Map tiles by <a href="https://stamen.com">Stamen</a>'
            opacity={1.0}
          />

          <FlyToSelected location={selected} />

          {filtered.map((ecdc) => {
            const groupName  = dominantGroupName(ecdc.practitioners);
            const isSelected = selectMode ? selectedIds.has(ecdc.id) : selected?.id === ecdc.id;
            return (
              <MapMarker
                key={ecdc.id}
                position={[ecdc.latitude, ecdc.longitude]}
                icon={createCustomIcon(isSelected, groupName)}
                eventHandlers={{ click: () => handleSelect(ecdc) }}
              >
                <MapTooltip offset={[0, -7]} direction="top" className="ecdc-map-tooltip">
                  <span className="tooltip-name">{ecdc.name || 'Unnamed Centre'}</span>
                  <span className="tooltip-practitioners">
                    {ecdc.practitioners?.map((p) => p.name).join(', ') || 'No practitioners listed'}
                  </span>
                </MapTooltip>
              </MapMarker>
            );
          })}

          {landmarks.map((lm) => (
            <MapMarker
              key={`lm-${lm.id}`}
              position={[lm.latitude, lm.longitude]}
              icon={getLandmarkIcon(lm)}
            >
              <MapTooltip offset={[0, -9]} direction="top" className="ecdc-map-tooltip">
                <span className="tooltip-name">{lm.name || 'Unnamed Landmark'}</span>
                {lm.type && (
                  <span className="tooltip-practitioners" style={{ textTransform: 'capitalize' }}>
                    {lm.type.replace(/_/g, ' ')}
                  </span>
                )}
              </MapTooltip>
            </MapMarker>
          ))}
        </MapContainer>

        {/* ── Floating panel ── */}
        <div className="ecdc-panel">
          <div className="ecdc-panel__header">
            <h2>ECDC Directory</h2>
            <button
              className={`ecdc-select-toggle${selectMode ? ' ecdc-select-toggle--active' : ''}`}
              onClick={toggleSelectMode}
              title={selectMode ? 'Exit selection mode' : 'Select multiple centres'}
            >
              {selectMode ? (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Done
                </>
              ) : (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <path d="M17 14l2 2 4-4" />
                  </svg>
                  Select
                </>
              )}
            </button>
          </div>

          {/* Search */}
          <div className="ecdc-search-wrap">
            <svg className="ecdc-search-icon" width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              className="ecdc-search-input"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* ── Training filters ── */}
          <div className="ecdc-filter-section">
            <div className="ecdc-filter-toggle" onClick={() => setFiltersOpen((v) => !v)}>
              <span className="ecdc-filter-toggle__label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                Training filters
                {activeFilters.length > 0 && (
                  <span className="ecdc-filter-active-count">{activeFilters.length}</span>
                )}
              </span>
              <svg
                className={`ecdc-filter-chevron${filtersOpen ? ' ecdc-filter-chevron--open' : ''}`}
                width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            {filtersOpen && (
              <div className="ecdc-filter-body">
                <div className="ecdc-filter-mode">
                  <button
                    className={`ecdc-filter-mode-btn${filterMode === 'any' ? ' ecdc-filter-mode-btn--active' : ''}`}
                    onClick={() => setFilterMode('any')}
                  >Any selected</button>
                  <button
                    className={`ecdc-filter-mode-btn${filterMode === 'all' ? ' ecdc-filter-mode-btn--active' : ''}`}
                    onClick={() => setFilterMode('all')}
                  >All selected</button>
                </div>
                <div className="ecdc-filter-mode">
                  <button
                    className={`ecdc-filter-mode-btn${trainingStatus === 'has' ? ' ecdc-filter-mode-btn--active' : ''}`}
                    onClick={() => setTrainingStatus('has')}
                  >Has training</button>
                  <button
                    className={`ecdc-filter-mode-btn${trainingStatus === 'needs' ? ' ecdc-filter-mode-btn--active' : ''}`}
                    onClick={() => setTrainingStatus('needs')}
                  >Needs training</button>
                </div>
                {TRAINING_FILTERS.map((f) => (
                  <label key={f.key} className="ecdc-filter-chip">
                    <input
                      type="checkbox"
                      checked={activeFilters.includes(f.key)}
                      onChange={() => toggleFilter(f.key)}
                    />
                    <span className="ecdc-filter-chip__label">{f.label}</span>
                  </label>
                ))}
                {activeFilters.length > 0 && (
                  <button className="ecdc-filter-clear" onClick={() => setActiveFilters([])}>
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Visit filter ── */}
          <div className="ecdc-filter-section">
            <div className="ecdc-filter-toggle" onClick={() => setVisitFilterOpen((v) => !v)}>
              <span className="ecdc-filter-toggle__label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8"  y1="2" x2="8"  y2="6" />
                  <line x1="3"  y1="10" x2="21" y2="10" />
                </svg>
                Visit filter
                {visitPreset && <span className="ecdc-filter-active-count">1</span>}
              </span>
              <svg
                className={`ecdc-filter-chevron${visitFilterOpen ? ' ecdc-filter-chevron--open' : ''}`}
                width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            {visitFilterOpen && (
              <div className="ecdc-visit-filter-body">
                {visitsLoading && (
                  <div className="ecdc-visits-loading">
                    <div className="spinner spinner--sm" />
                    Loading visit history…
                  </div>
                )}
                {VISIT_PRESETS.map((preset) => (
                  <label
                    key={preset.key}
                    className={`ecdc-radio-chip${visitPreset === preset.key ? ' ecdc-radio-chip--selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="visit_preset"
                      checked={visitPreset === preset.key}
                      onChange={() => setVisitPreset(preset.key)}
                    />
                    <span className="ecdc-radio-label">{preset.label}</span>
                  </label>
                ))}
                {visitPreset && (
                  <button className="ecdc-filter-clear" onClick={() => setVisitPreset(null)}>
                    Clear filter
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Count + show/hide list toggle */}
          <div className="ecdc-count-row">
            <span className="ecdc-count">
              {filtered.length} / {ecdcs.length} centre{ecdcs.length !== 1 ? 's' : ''}
            </span>
            <button
              className={`ecdc-show-btn${listVisible ? ' ecdc-show-btn--active' : ''}`}
              onClick={() => setListVisible((v) => !v)}
            >
              {listVisible ? 'Hide' : 'Show'}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>

          {/* ── Select-mode toolbar ── */}
          {selectMode && listVisible && (
  <>
    {/* Box 1: Selection controls */}
    <div className="ecdc-select-toolbar">
      <span className="ecdc-select-toolbar__count">
        {selectedIds.size} selected
      </span>
      <div className="ecdc-select-toolbar__actions">
        <button className="ecdc-select-toolbar__btn" onClick={selectAll}>All</button>
        <button className="ecdc-select-toolbar__btn" onClick={clearAll}>None</button>
      </div>
    </div>

    {/* Box 2: Actions for selected items */}
        {selectedIds.size > 0 && (
          <div className="ecdc-select-toolbar">
            <div className="ecdc-select-toolbar__actions">
              <button
                className={`ecdc-select-toolbar__btn ${viewSelectedOnly ? 'ecdc-select-toolbar__btn--primary' : ''}`}
                onClick={() => setViewSelectedOnly(v => !v)}
                title="Toggle showing only selected centres"
              >
                {viewSelectedOnly ? "Show all" : "Selected only"}
              </button>
              <button
                className="ecdc-select-toolbar__btn"
                onClick={handleViewPractitioners}
                title="View practitioners for selected centres"
              >
                View Practitioners
              </button>
              {isAdmin && (
                <button
                  className="ecdc-select-toolbar__btn"
                  onClick={() => navigate(`/outreach-planning?ecdcs=${Array.from(selectedIds).join(',')}`)}
                  title="Create planned outreach for selected centres"
                >
                  Add to Planned Outreach
                </button>
              )}
              <button
                className="ecdc-select-toolbar__btn"
                onClick={() => setReportOpen(true)}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                Export
              </button>
            </div>
          </div>
        )}
      </>
    )}

          {/* Scrollable ECDC list */}
          <div className={`ecdc-list${listVisible ? '' : ' ecdc-list--hidden'}`}>
            {filtered.map((ecdc) => {
              const groupName  = dominantGroupName(ecdc.practitioners);
              const c          = resolveGroupColor(groupName);
              const isChecked  = selectedIds.has(ecdc.id);
              return (
                <div
                  key={ecdc.id}
                  className={`ecdc-item${
                    !selectMode && selected?.id === ecdc.id ? ' ecdc-item--selected' : ''
                  }${
                    selectMode && isChecked ? ' ecdc-item--checked' : ''
                  }`}
                  onClick={() => handleSelect(ecdc)}
                >
                  {selectMode && (
                    <div className={`ecdc-item__checkbox${isChecked ? ' ecdc-item__checkbox--checked' : ''}`}>
                      {isChecked && (
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  )}
                  <div className="ecdc-item__body">
                    <div className="ecdc-item__top">
                      <div className="ecdc-item__dot" style={{ background: c.fill }} />
                      <div className="ecdc-item__name">{ecdc.name || 'Unnamed Centre'}</div>
                    </div>
                    {ecdc.area && <div className="ecdc-item__area">{ecdc.area}</div>}
                    {ecdc.practitioners?.length > 0 && (
                      <span className="ecdc-item__badge">
                        {ecdc.practitioners.length} practitioner{ecdc.practitioners.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {!loading && filtered.length === 0 && (
              <div style={{
                padding: '16px',
                color: themeColors.textMuted,
                fontSize: '0.83rem',
                textAlign: 'center',
              }}>
                No results found
              </div>
            )}
          </div>
        </div>

        {/* ── Detail card (single-select mode only) ── */}
        {!selectMode && selected && (() => {
          const dominantGroup = dominantGroupName(selected.practitioners);
          const dc = resolveGroupColor(dominantGroup);
          return (
            <div className="ecdc-detail">
              <button className="ecdc-detail__close" onClick={() => setSelected(null)}>✕</button>

              <div className="ecdc-detail__header">
                <div className="ecdc-detail__group-dot" style={{ background: dc.fill }} />
                <div className="ecdc-detail__name">{selected.name}</div>
              </div>

              <div className="ecdc-detail__meta">
                {selected.area && <div className="ecdc-detail__area">{selected.area}</div>}
                {dominantGroup && (
                  <div className="ecdc-detail__group-label" style={{ color: dc.fill }}>
                    {dominantGroup}
                  </div>
                )}
              </div>

              <div style={{ padding: '0 16px 16px', display: 'flex', justifyContent: 'flex-end' }}>
                <AdminSoftDeleteButton
                  onConfirm={() => deleteEcdc(selected.id, { onSuccess: () => setSelected(null) })}
                  isPending={deleteEcdcPending}
                  label="Delete ECDC"
                />
              </div>

              <div className="ecdc-practitioners-heading">Practitioners</div>

              {selected.practitioners?.length > 0 ? (
                selected.practitioners.map((p) => {
                  const tags            = getTrainingTags(p.training);
                  const pc              = resolveGroupColor(p.group?.group_name);
                  const lastVisitISO    = lastVisitMap?.get(p.id) ?? null;
                  const lastVisitDisplay = fmtDate(lastVisitISO);
                  const overdue         = isPractitionerOverdue(p.id, visitPreset, lastVisitMap);

                  return (
                    <div key={p.id} className="ecdc-prac-card">
                      <div className="ecdc-prac-card__name">{p.name || '—'}</div>

                      {p.group?.group_name && (
                        <div className="ecdc-prac-card__group" style={{ color: pc.fill }}>
                          <div className="ecdc-prac-card__group-dot" style={{ background: pc.fill }} />
                          {p.group.group_name}
                        </div>
                      )}

                      {p.contact_number1 && (
                        <div className="ecdc-prac-card__contact">
                          <PhoneIcon />{p.contact_number1}
                        </div>
                      )}
                      {p.contact_number2 && (
                        <div className="ecdc-prac-card__contact">
                          <PhoneIcon />{p.contact_number2}
                        </div>
                      )}

                      {lastVisitMap && (
                        <div className={`ecdc-prac-card__last-visit${overdue ? ' ecdc-prac-card__last-visit--overdue' : ''}`}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8"  y1="2" x2="8"  y2="6" />
                            <line x1="3"  y1="10" x2="21" y2="10" />
                          </svg>
                          {lastVisitDisplay
                            ? `Last visit: ${lastVisitDisplay}${overdue ? ' ⚠' : ''}`
                            : 'Never visited'}
                        </div>
                      )}

                      {tags.length > 0 && (
                        <div className="ecdc-prac-card__training">
                          {tags.map((tag) => (
                            <span key={tag} className="ecdc-training-tag">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div style={{ fontSize: '0.82rem', color: themeColors.textMuted, fontStyle: 'italic' }}>
                  No practitioners linked yet.
                </div>
              )}
            </div>
          );
        })()}

        {!loading && (
          <div className="ecdc-badge">
            {filtered.length} / {ecdcs.length} centres
          </div>
        )}

        {/* ── M&E Report Drawer ── */}
        {reportOpen && (
          <div className="ecdc-report-overlay" onClick={() => setReportOpen(false)}>
            <div className="ecdc-report-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="ecdc-report-drawer__header">
                <div className="ecdc-report-drawer__title">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  Selected ECDCs
                  <span className="ecdc-report-drawer__subtitle">{selectedEcdcs.length} centre{selectedEcdcs.length !== 1 ? 's' : ''}</span>
                </div>

              <div className="ecdc-report-export-btns">
                <button
                  className="ecdc-report-export-btn"
                  title="Export as Excel"
                  onClick={() => exportReportAsExcel(selectedEcdcs, lastVisitMap)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="8" y1="13" x2="16" y2="13"/>
                    <line x1="8" y1="17" x2="16" y2="17"/>
                  </svg>
                  Excel
                </button>
                <button
                  className="ecdc-report-export-btn"
                  title="Export as PDF"
                  onClick={() => drawerBodyRef.current && exportReportAsPDF(drawerBodyRef.current)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                  PDF
                </button>
              </div>

              <button className="ecdc-report-drawer__close" onClick={() => setReportOpen(false)}>✕</button>
              </div>

              <div className="ecdc-report-drawer__body" ref={drawerBodyRef}>
                {selectedEcdcs.map((ecdc) => {
                  const dominantGroup = dominantGroupName(ecdc.practitioners);
                  const dc = resolveGroupColor(dominantGroup);

                  return (
                    <div key={ecdc.id} className="ecdc-report-centre">
                      {/* Centre header */}
                      <div className="ecdc-report-centre__header">
                        <div className="ecdc-report-centre__dot" style={{ background: dc.fill }} />
                        <div>
                          <div className="ecdc-report-centre__name">{ecdc.name || 'Unnamed Centre'}</div>
                          {ecdc.area && <div className="ecdc-report-centre__area">{ecdc.area}</div>}
                        </div>
                        <div className="ecdc-report-centre__remove">
                          <button
                            className="ecdc-report-centre__remove"
                            onClick={(e) => {
                              e.stopPropagation(); 
                              handleRemove(ecdc.id);
                            }}
                          > <CloseIcon />
                          </button>
                        </div>

                      </div>

                      {/* Practitioners table */}
                      {ecdc.practitioners?.length > 0 ? (
                        <div className="ecdc-report-table-wrap">
                          <table className="ecdc-report-table">
                            <thead>
                              <tr>
                                <th>Practitioner</th>
                                <th>Group</th>
                                <th>Contact</th>
                                <th>Last Visit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ecdc.practitioners.map((p) => {
                                const pc              = resolveGroupColor(p.group?.group_name);
                                const lastVisitISO    = lastVisitMap?.get(p.id) ?? null;
                                const lastVisitDisplay = fmtDate(lastVisitISO);
                                const overdue         = isPractitionerOverdue(p.id, visitPreset, lastVisitMap);

                                return (
                                  <tr key={p.id}>
                                    {/* Name */}
                                    <td className="ecdc-report-table__name">{p.name || '—'}</td>

                                    {/* Group */}
                                    <td>
                                      {p.group?.group_name ? (
                                        <span className="ecdc-report-group-chip" style={{ borderColor: pc.fill, color: pc.fill }}>
                                          <span className="ecdc-report-group-chip__dot" style={{ background: pc.fill }} />
                                          {resolveGroupNameShortForm(p.group.group_name)}
                                        </span>
                                      ) : <span className="ecdc-report-empty">—</span>}
                                    </td>

                                    {/* Contact */}
                                    <td className="ecdc-report-table__contact">
                                      {p.contact_number1 ? (
                                        <div className="ecdc-report-contact-row">
                                          <PhoneIcon />{p.contact_number1}
                                        </div>
                                      ) : null}
                                      {p.contact_number2 ? (
                                        <div className="ecdc-report-contact-row">
                                          <PhoneIcon />{p.contact_number2}
                                        </div>
                                      ) : null}
                                      {!p.contact_number1 && !p.contact_number2 && (
                                        <span className="ecdc-report-empty">—</span>
                                      )}
                                    </td>

                                    {/* Last visit */}
                                    <td>
                                      {lastVisitMap ? (
                                        <span className={`ecdc-report-visit${overdue ? ' ecdc-report-visit--overdue' : lastVisitDisplay ? ' ecdc-report-visit--ok' : ' ecdc-report-visit--never'}`}>
                                          {lastVisitDisplay ?? 'Never'}
                                          {overdue && ' ⚠'}
                                        </span>
                                      ) : (
                                        <span className="ecdc-report-empty">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="ecdc-report-no-practitioners">No practitioners linked.</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
