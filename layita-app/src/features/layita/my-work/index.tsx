import { useMyWork } from '../api/useMyWork';
import '../../../styles/shared.css';
import '../../../styles/my-work.css';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';

export default function MyWorkPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { data, isLoading, error } = useMyWork();

  if (!authLoading && isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="page mw-page">

      <main className="mw-main">
        <header className="mw-header">
          <h1 className="mw-title">My Work</h1>
          <p className="mw-subtitle">
            {data?.staffName ? `Planned and recent activity for ${data.staffName}.` : 'Your planned and recent activity.'}
          </p>
        </header>

        {isLoading ? (
          <div className="mw-empty">Loading your work...</div>
        ) : error ? (
          <div className="mw-empty">Could not load your work.</div>
        ) : (
          <div className="mw-grid">
            <section className="mw-section">
              <h2 className="mw-section__title">Planned Visits</h2>
              {data?.plannedVisits.length ? (
                <div className="mw-list">
                  {data.plannedVisits.map((visit) => (
                    <div key={visit.id} className="mw-row">
                      <div>
                        <strong>{visit.practitioner_name}</strong>
                        <span>{visit.outreach_type}</span>
                      </div>
                      <div className="mw-row__right">
                        <span>{visit.scheduled_date}</span>
                        <span>{visit.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mw-empty">No upcoming planned visits found.</div>
              )}
            </section>

            <section className="mw-section">
              <h2 className="mw-section__title">Recent Visits</h2>
              {data?.recentVisits.length ? (
                <div className="mw-list">
                  {data.recentVisits.map((visit) => (
                    <div key={visit.id} className="mw-row">
                      <div>
                        <strong>{visit.practitioners?.name || 'Unknown practitioner'}</strong>
                        <span>{visit.outreach_type || 'Visit'}</span>
                      </div>
                      <div className="mw-row__right">
                        <span>{visit.date || '-'}</span>
                        <span>{visit.source || 'manual'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mw-empty">No recent visits found.</div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
