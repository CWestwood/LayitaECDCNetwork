// src/features/visits/index.tsx

import { useMemo, useState } from 'react';
import { themeColors as t } from '../../lib/layita_colors';
import { formatLabel } from '../../lib/format';
import { useVisits, VisitRow } from './api/useVisits';
import VisitRowComponent from './Visitrow';
import VisitDetail from './Visitdetail';
import {
  groupByMonth,
  ChevronIcon,
} from './_components';

import '../../styles/shared.css';
import '../../styles/outreachVisits.css';

type SortDir = 'asc' | 'desc';

const FIXED_TYPES = ['literacy_promotion'];
const UPDATE_TYPES = new Set(['update', 'update_ecdc_details', 'update ecdc details']);

function isUpdateType(type: string | null | undefined) {
  return UPDATE_TYPES.has(type?.toLowerCase().trim().replace(/\s+/g, '_') ?? '');
}

export default function OutreachVisits() {
  const [selected, setSelected] = useState<VisitRow | null>(null);
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  const [activeHappened, setActiveHappened] = useState<string[]>([]);
  const [staffFilter, setStaffFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: visits = [], isLoading: loading, error } = useVisits();

  const visitRows = useMemo(
    () => visits.filter((visit) => !isUpdateType(visit.outreach_type)),
    [visits],
  );

  const allTypes = useMemo(() => {
    const seen = new Set<string>(FIXED_TYPES);
    visitRows.forEach((v) => {
      if (v.outreach_type) seen.add(v.outreach_type);
    });
    return Array.from(seen).sort((a, b) => formatLabel(a).localeCompare(formatLabel(b)));
  }, [visitRows]);

  const staffOptions = useMemo(() => {
    const seen = new Map<string, string>();
    visitRows.forEach((visit) => {
      if (visit.data_capturer_id) {
        seen.set(visit.data_capturer_id, visit.data_capturer?.name || 'Unknown Staff');
      }
    });
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [visitRows]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();

    const list = visitRows.filter((v) => {
      const matchSearch =
        !q ||
        v.practitioner?.name?.toLowerCase().includes(q) ||
        v.practitioner?.ecdc?.name?.toLowerCase().includes(q) ||
        v.data_capturer?.name?.toLowerCase().includes(q) ||
        v.outreach_type?.toLowerCase().includes(q) ||
        v.comments?.toLowerCase().includes(q);

      const matchType = activeTypes.length === 0 || activeTypes.includes(v.outreach_type ?? '');
      const matchHap = activeHappened.length === 0 || activeHappened.includes(
        v.outreach_happened?.toLowerCase()?.trim() ?? 'null'
      );
      const matchStaff = staffFilter === 'all' || v.data_capturer_id === staffFilter;
      const matchFrom = !dateFrom || (v.date != null && v.date >= dateFrom);
      const matchTo = !dateTo || (v.date != null && v.date <= dateTo);

      return matchSearch && matchType && matchHap && matchStaff && matchFrom && matchTo;
    });

    return [...list].sort((a, b) => {
      const da = a.date ?? '', db = b.date ?? '';
      return sortDir === 'desc' ? db.localeCompare(da) : da.localeCompare(db);
    });
  }, [visitRows, search, activeTypes, activeHappened, staffFilter, dateFrom, dateTo, sortDir]);

  const grouped = useMemo(() => groupByMonth(filtered), [filtered]);

  const stats = useMemo(() => {
    const totalParents = filtered.reduce((s, v) => s + (Number(v.parents_trained) || 0), 0);
    const totalEnrolledParents = filtered.reduce((s, v) => s + (Number(v.parents_enrolled) || 0), 0);
    const attendanceRate = totalEnrolledParents > 0 ? Math.round((totalParents / totalEnrolledParents) * 100) : 0;

    return {
      total: filtered.length,
      happened: filtered.filter((v) => v.outreach_happened?.toLowerCase() === 'yes').length,
      totalParents,
      attendanceRate,
      totalBooks: filtered.reduce((s, v) => s + (Number(v.children_books) || 0), 0),
      totalPractitionerBooks: filtered.reduce((s, v) => s + (Number(v.books_to_practitioner) || 0), 0),
      totalKm: filtered.reduce((s, v) => s + (Number(v.transport_km) || 0), 0),
      totalCost: filtered.reduce((s, v) => s + (Number(v.transport_cost) || 0), 0),
    };
  }, [filtered]);

  const toggleType = (type: string) =>
    setActiveTypes((prev) => prev.includes(type) ? prev.filter((x) => x !== type) : [...prev, type]);

  const toggleHap = (h: string) =>
    setActiveHappened((prev) => prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]);

  const handleSelect = (v: VisitRow) =>
    setSelected((prev) => prev?.id === v.id ? null : v);

  const clearFilters = () => {
    setActiveTypes([]);
    setActiveHappened([]);
    setStaffFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const anyFilters = activeTypes.length > 0 || activeHappened.length > 0 || staffFilter !== 'all' || !!dateFrom || !!dateTo;

  return (
    <div className="page">

      <div className="ov-main">
        <div className="ov-topbar">
          <div className="ov-topbar__title">Outreach Visits</div>
          <div className="ov-topbar__controls">
            <div className="ov-search-wrap">
              <svg className="ov-search-icon" width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                className="ov-search-input"
                placeholder="Search practitioner, ECDC, staff, type..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <input className="ov-select ov-date-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" />
            <input className="ov-select ov-date-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" />

            <select className="ov-select" value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} aria-label="Filter by staff member">
              <option value="all">All staff</option>
              {staffOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>

            <button
              className="ov-select"
              style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
              onClick={() => setSortDir((d) => d === 'desc' ? 'asc' : 'desc')}
            >
              {sortDir === 'desc' ? 'Newest first' : 'Oldest first'}
              <ChevronIcon dir={sortDir === 'desc' ? 'down' : 'up'} />
            </button>
          </div>
        </div>

        <div className="ov-filterbar">
          <span className="ov-filter-label">Type</span>
          {allTypes.map((type) => (
            <button
              key={type}
              className={`ov-chip${activeTypes.includes(type) ? ' ov-chip--active' : ''}`}
              onClick={() => toggleType(type)}
            >
              {formatLabel(type)}
            </button>
          ))}

          <div className="ov-divider" />
          <span className="ov-filter-label">Status</span>

          {([
            { key: 'yes', label: 'Happened' },
            { key: 'no', label: 'Did not happen' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              className={`ov-chip${activeHappened.includes(key) ? ' ov-chip--active' : ''}`}
              onClick={() => toggleHap(key)}
            >
              {label}
            </button>
          ))}

          {anyFilters && (
            <button className="ov-filter-clear" onClick={clearFilters}>
              Clear all
            </button>
          )}
        </div>

        <div className="ov-stats">
          {([
            { value: stats.total, label: 'Visits shown' },
            { value: stats.happened, label: 'Completed', color: t.success },
            { value: stats.totalParents, label: 'Parents trained' },
            { value: `${stats.attendanceRate}%`, label: 'Attendance rate' },
            { value: `${stats.totalBooks} (${stats.totalBooks})`, label: 'Books to children' },
            { value: stats.totalPractitionerBooks, label: 'Books left with practitioners' },
            { value: `${Math.round(stats.totalKm)} km`, label: 'Total distance' },
            { value: `R${Math.round(stats.totalCost).toLocaleString()}`, label: 'Transport cost' },
          ] as const).map((stat) => (
            <div key={stat.label} className="ov-stat">
              <div
                className="ov-stat__value"
                style={'color' in stat && stat.color ? { color: stat.color } : undefined}
              >
                {stat.value}
              </div>
              <div className="ov-stat__label">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="ov-body">
          <div className={`ov-list-panel${!selected ? ' ov-list-panel--expanded' : ''}`}>
            {loading ? (
              <div className="ov-loading">
                <div className="spinner spinner--md" /> Loading visits...
              </div>
            ) : error ? (
              <div className="ov-no-results" role="alert">
                Outreach visits could not be loaded. {error.message}
              </div>
            ) : (
              <div className="ov-list-scroll">
                {filtered.length === 0 ? (
                  <div className="ov-no-results">No visits match your filters.</div>
                ) : (
                  <>
                    <div className="ov-list-header">
                      <div style={{ textAlign: 'center' }}>Date</div>
                      <div style={{ textAlign: 'center' }}>Practitioner</div>
                      <div style={{ textAlign: 'center' }}>Staff</div>
                      <div style={{ textAlign: 'center' }}>Type</div>
                      <div style={{ textAlign: 'center' }}>Status</div>
                      <div style={{ textAlign: 'center' }}>Parents</div>
                      <div style={{ textAlign: 'center' }}>Books</div>
                      <div style={{ textAlign: 'center' }}>Distance</div>
                      <div style={{ textAlign: 'center' }}>Notes</div>
                    </div>
                    {grouped.map(({ month, visits: groupVisits }) => (
                      <div key={month}>
                        <div className="ov-month-header">
                          {month}
                          <span className="ov-month-header__count">{groupVisits.length}</span>
                        </div>
                        {groupVisits.map((visit) => (
                          <VisitRowComponent
                            key={visit.id}
                            v={visit}
                            isSelected={selected?.id === visit.id}
                            onClick={() => handleSelect(visit)}
                          />
                        ))}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {selected && (
            <div className="ov-detail-panel ov-detail-panel--open">
              <VisitDetail visit={selected} onClose={() => setSelected(null)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
