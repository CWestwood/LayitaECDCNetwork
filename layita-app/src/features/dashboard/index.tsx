import React from 'react';
import { useDashboardStats } from './api/useDashboardStats';
import '../../styles/dashboard.css';
import Sidebar from '../../layouts/Sidebar';

export default function Dashboard() {
  const { data, isLoading, error } = useDashboardStats();

  if (isLoading) {
    return (
      <div className="da-page">
        <Sidebar />
        <div className="da-main">
          <div className="da-loading">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="da-page">
        <Sidebar />
        <div className="da-main">
          <div className="da-error">Failed to load dashboard: {error.message}</div>
        </div>
      </div>
    );
  }

  const stats = data!;

  return (
    <div className="da-page">
      <Sidebar />
      <div className="da-main">
        <header className="da-topbar">
          <h1 className="da-topbar__title">Dashboard Overview</h1>
        </header>

        <div className="da-body">
          <div className="da-stats-grid">
            <div className="da-stat-card">
              <span className="da-stat-card__label">Total Practitioners</span>
              <span className="da-stat-card__value">{stats.totalPractitioners}</span>
            </div>
            <div className="da-stat-card">
              <span className="da-stat-card__label">Total ECDCs</span>
              <span className="da-stat-card__value">{stats.totalEcdcs}</span>
            </div>
            <div className="da-stat-card">
              <span className="da-stat-card__label">Visits This Year</span>
              <span className="da-stat-card__value">{stats.visitsThisYear.total}</span>
            </div>
            <div className="da-stat-card">
              <span className="da-stat-card__label">Missed Visits</span>
              <span className="da-stat-card__value da-stat-card__value--warning">
                {stats.visitsThisYear.didNotHappen}
              </span>
            </div>
            <div className="da-stat-card">
              <span className="da-stat-card__label">New Sites Mapped</span>
              <span className="da-stat-card__value da-stat-card__value--success">
                {stats.visitsThisYear.mappingVisits}
              </span>
            </div>
          </div>

          <div className="da-section">
            <h2 className="da-section__title">Visits by Type (Year)</h2>
            <div className="da-chart-row">
              {Object.entries(stats.visitsThisYear.byType).length === 0 ? (
                <div className="da-empty">No visits recorded this year yet.</div>
              ) : (
                Object.entries(stats.visitsThisYear.byType).map(([type, count]) => (
                  <div key={type} className="da-type-bar">
                    <span className="da-type-bar__label">{type.replace(/_/g, ' ')}</span>
                    <span className="da-type-bar__value">{count}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="da-section">
            <h2 className="da-section__title">Recent Visits</h2>
            <div className="da-recent-list">
              {stats.recentVisits.length === 0 ? (
                <div className="da-empty">No recent visits found.</div>
              ) : (
                stats.recentVisits.map(visit => (
                  <div key={visit.id} className="da-recent-item">
                    <div className="da-recent-item__left">
                      <span className="da-recent-item__type">
                        {visit.outreach_type?.replace(/_/g, ' ') || 'Unknown'}
                      </span>
                      <span className="da-recent-item__details">
                        {visit.practitioner?.name || 'Unknown Practitioner'} 
                        {visit.practitioner?.ecdc?.name ? ` • ${visit.practitioner.ecdc.name}` : ''}
                      </span>
                    </div>
                    <div className="da-recent-item__right">
                      {visit.date ? new Date(visit.date).toLocaleDateString() : '—'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
