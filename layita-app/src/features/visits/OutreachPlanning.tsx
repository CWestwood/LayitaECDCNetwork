import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import Sidebar from '../../layouts/Sidebar';
import { formatDate, formatLabel } from '../../lib/format';
import { useAuth } from '../auth/useAuth';
import {
  PlanningRow,
  useCreatePlannedVisit,
  usePlannedVisits,
  usePlanningPractitioners,
  usePlanningStaff,
} from './api/usePlannedVisits';
import '../../styles/shared.css';
import '../../styles/outreachPlanning.css';

const OUTREACH_TYPES = [
  'outreach',
  'training',
  'literacy_promotion',
  'monitoring',
  'support_visit',
  'other',
];

function exportPlannedVisits(rows: PlanningRow[]) {
  const headers = [
    'Scheduled Date',
    'Practitioner',
    'ECDC',
    'Area',
    'Contact 1',
    'Contact 2',
    'Assigned Staff',
    'Outreach Type',
    'Status',
  ];

  const csvRows = rows.map((row) => [
    formatDate(row.scheduled_date),
    row.practitioner?.name || row.practitioner_name || '',
    row.practitioner?.ecdc?.name || '',
    row.practitioner?.ecdc?.area || '',
    row.practitioner?.contact_number1 || '',
    row.practitioner?.contact_number2 || '',
    row.assigned_to?.name || '',
    formatLabel(row.outreach_type),
    formatLabel(row.status),
  ]);

  const csv = [headers, ...csvRows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `outreach-planning-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function OutreachPlanningPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const selectedEcdcIds = useMemo(
    () => new Set((searchParams.get('ecdcs') || '').split(',').filter(Boolean)),
    [searchParams],
  );

  const { data: plannedVisits = [], isLoading: plannedLoading } = usePlannedVisits();
  const { data: practitioners = [], isLoading: practitionersLoading } = usePlanningPractitioners();
  const { data: staff = [] } = usePlanningStaff();
  const createPlannedVisit = useCreatePlannedVisit();

  const filteredPractitioners = useMemo(() => {
    if (selectedEcdcIds.size === 0) return practitioners;
    return practitioners.filter((practitioner) => practitioner.ecdc?.id && selectedEcdcIds.has(practitioner.ecdc.id));
  }, [practitioners, selectedEcdcIds]);

  const [form, setForm] = useState({
    practitionerId: '',
    scheduledDate: '',
    outreachType: 'outreach',
    assignedTo: '',
  });

  if (!authLoading && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const selectedPractitioner = filteredPractitioners.find((practitioner) => practitioner.id === form.practitionerId);
  const visiblePlans = selectedEcdcIds.size === 0
    ? plannedVisits
    : plannedVisits.filter((row) => row.practitioner?.ecdc?.id && selectedEcdcIds.has(row.practitioner.ecdc.id));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPractitioner || !form.scheduledDate || !form.outreachType) return;

    createPlannedVisit.mutate({
      practitionerId: selectedPractitioner.id,
      practitionerName: selectedPractitioner.name || 'Unnamed practitioner',
      scheduledDate: form.scheduledDate,
      outreachType: form.outreachType,
      assignedTo: form.assignedTo || null,
    }, {
      onSuccess: () => setForm((current) => ({
        ...current,
        practitionerId: '',
        scheduledDate: '',
      })),
    });
  };

  return (
    <div className="page">
      <Sidebar />
      <main className="op-main">
        <header className="op-header">
          <div>
            <h1 className="op-title">Outreach Planning</h1>
            <p className="op-subtitle">
              Create planned visits and export a staff-ready outreach list with contact details.
            </p>
          </div>
          <button className="op-button" onClick={() => exportPlannedVisits(visiblePlans)} disabled={visiblePlans.length === 0}>
            Export CSV
          </button>
        </header>

        {selectedEcdcIds.size > 0 && (
          <div className="op-notice">
            Showing practitioners and planned visits for {selectedEcdcIds.size} selected ECDC{selectedEcdcIds.size === 1 ? '' : 's'}.
          </div>
        )}

        <section className="op-section">
          <h2 className="op-section__title">Create Planned Visit</h2>
          <form className="op-form" onSubmit={submit}>
            <label>
              <span>Practitioner / ECDC</span>
              <select
                value={form.practitionerId}
                onChange={(event) => setForm((current) => ({ ...current, practitionerId: event.target.value }))}
                required
              >
                <option value="">Choose practitioner</option>
                {filteredPractitioners.map((practitioner) => (
                  <option key={practitioner.id} value={practitioner.id}>
                    {practitioner.name || 'Unnamed practitioner'}{practitioner.ecdc?.name ? ` - ${practitioner.ecdc.name}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Date</span>
              <input
                type="date"
                value={form.scheduledDate}
                onChange={(event) => setForm((current) => ({ ...current, scheduledDate: event.target.value }))}
                required
              />
            </label>

            <label>
              <span>Staff Member</span>
              <select
                value={form.assignedTo}
                onChange={(event) => setForm((current) => ({ ...current, assignedTo: event.target.value }))}
              >
                <option value="">Unassigned</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>{person.name || 'Unnamed staff member'}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Outreach Type</span>
              <select
                value={form.outreachType}
                onChange={(event) => setForm((current) => ({ ...current, outreachType: event.target.value }))}
                required
              >
                {OUTREACH_TYPES.map((type) => (
                  <option key={type} value={type}>{formatLabel(type)}</option>
                ))}
              </select>
            </label>

            <button className="op-button op-button--primary" type="submit" disabled={createPlannedVisit.isPending || practitionersLoading}>
              {createPlannedVisit.isPending ? 'Creating...' : 'Create Plan'}
            </button>
          </form>
        </section>

        <section className="op-section">
          <h2 className="op-section__title">Planned Visits</h2>
          {plannedLoading ? (
            <div className="op-empty">Loading planned visits...</div>
          ) : visiblePlans.length === 0 ? (
            <div className="op-empty">No planned visits found.</div>
          ) : (
            <div className="op-table-wrap">
              <table className="op-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Practitioner</th>
                    <th>ECDC</th>
                    <th>Contact</th>
                    <th>Staff</th>
                    <th>Type</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePlans.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDate(row.scheduled_date)}</td>
                      <td>{row.practitioner?.name || row.practitioner_name || '-'}</td>
                      <td>{row.practitioner?.ecdc?.name || '-'}</td>
                      <td>{row.practitioner?.contact_number1 || row.practitioner?.contact_number2 || '-'}</td>
                      <td>{row.assigned_to?.name || 'Unassigned'}</td>
                      <td>{formatLabel(row.outreach_type)}</td>
                      <td>{formatLabel(row.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
