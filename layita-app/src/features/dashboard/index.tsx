import { useMemo, useState } from 'react';
import { useDashboardStats } from './api/useDashboardStats';
import '../../styles/shared.css';
import '../../styles/dashboard.css';
import { formatDate, formatLabel } from '../../lib/format';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const yearOptions = useMemo(() => {
    const years = [];
    for (let y = currentYear; y >= currentYear - 5; y -= 1) years.push(y);
    return years;
  }, [currentYear]);
  const { data, isLoading, error } = useDashboardStats(year);

  if (isLoading) {
    return (
      <div className="da-page">
        <div className="da-main">
          <div className="da-loading">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="da-page">
        <div className="da-main">
          <div className="da-error">Failed to load dashboard: {error.message}</div>
        </div>
      </div>
    );
  }

  const stats = data!;
  const staffRows = Object.entries(stats.visitsForYear.byStaff)
    .sort(([, a], [, b]) => b.total - a.total);

  return (
    <div className="da-page">
      <div className="da-main">
        <header className="da-topbar">
          <h1 className="da-topbar__title">Dashboard Overview</h1>
          <div className="da-year-control">
            <label htmlFor="dashboard-year">Year</label>
            <select
              id="dashboard-year"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            >
              {yearOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </header>

        <div className="da-body">
          <div className="da-stats-grid">
            <Link className="da-stat-card" to="/practitioners">
              <span className="da-stat-card__label">Total Practitioners</span>
              <span className="da-stat-card__value">{stats.totalPractitioners}</span>
            </Link>
            <Link className="da-stat-card" to="/map">
              <span className="da-stat-card__label">Total ECDCs</span>
              <span className="da-stat-card__value">{stats.totalEcdcs}</span>
            </Link>
            <Link className="da-stat-card" to={`/visits?from=${year}-01-01&to=${year}-12-31`}>
              <span className="da-stat-card__label">Visits in {stats.selectedYear}</span>
              <span className="da-stat-card__value">{stats.visitsForYear.total}</span>
            </Link>
            <Link className="da-stat-card" to={`/visits?from=${year}-01-01&to=${year}-12-31&status=did_not_happen`}>
              <span className="da-stat-card__label">Missed Visits</span>
              <span className="da-stat-card__value da-stat-card__value--warning">
                {stats.visitsForYear.didNotHappen}
              </span>
            </Link>
            <Link className="da-stat-card" to="/map">
              <span className="da-stat-card__label">New Sites Mapped</span>
              <span className="da-stat-card__value da-stat-card__value--success">
                {stats.visitsForYear.mappingVisits}
              </span>
            </Link>
          </div>

          <section className="da-section">
            <h2 className="da-section__title">Visits by Type ({stats.selectedYear})</h2>
            <div className="da-chart-row">
              {Object.entries(stats.visitsForYear.byType).length === 0 ? (
                <div className="da-empty">No visits recorded for {stats.selectedYear} yet.</div>
              ) : (
                Object.entries(stats.visitsForYear.byType).map(([type, count]) => (
                  <Link key={type} className="da-type-bar" to={`/visits?from=${year}-01-01&to=${year}-12-31&type=${type}`}>
                    <span className="da-type-bar__label">{formatLabel(type)}</span>
                    <span className="da-type-bar__value">{count}</span>
                  </Link>
                ))
              )}
            </div>
          </section>

          <section className="da-section">
            <h2 className="da-section__title">Visits by Staff ({stats.selectedYear})</h2>
            {staffRows.length === 0 ? (
              <div className="da-empty">No visits recorded for {stats.selectedYear} yet.</div>
            ) : (
              <div className="da-table-wrap">
                <table className="da-staff-table">
                  <thead>
                    <tr>
                      <th>Staff Member</th>
                      <th>Total</th>
                      <th>Visit Types</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffRows.map(([staffName, staffStats]) => (
                      <tr key={staffName}>
                        <td>{staffName}</td>
                        <td>{staffStats.total}</td>
                        <td>
                          <div className="da-type-chips">
                            {Object.entries(staffStats.byType)
                              .sort(([, a], [, b]) => b - a)
                              .map(([type, count]) => (
                                <span key={type} className="da-type-chip">
                                  {formatLabel(type)} <strong>{count}</strong>
                                </span>
                              ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="da-section">
            <h2 className="da-section__title">Recent Visits</h2>
            <div className="da-recent-list">
              {stats.recentVisits.length === 0 ? (
                <div className="da-empty">No recent visits found.</div>
              ) : (
                stats.recentVisits.map((visit) => (
                  <div key={visit.id} className="da-recent-item">
                    <div className="da-recent-item__left">
                      <span className="da-recent-item__type">
                        {formatLabel(visit.outreach_type)}
                      </span>
                      <span className="da-recent-item__details">
                        {visit.practitioner?.name || 'Unknown Practitioner'}
                        {visit.practitioner?.ecdc?.name ? ` - ${visit.practitioner.ecdc.name}` : ''}
                      </span>
                    </div>
                    <div className="da-recent-item__right">
                      {formatDate(visit.date)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
