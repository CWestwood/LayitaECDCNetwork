import React, { useState } from 'react';
import {
  useDeletedPractitioners,
  useDeletedEcdcs,
  useDeletedVisits,
} from './api/useDeletedRecords';
import { useHardDeletePractitioner } from '../../practitioners/api/useDeletePractitioner';
import { useHardDeleteEcdc } from '../../ecdcs/api/useDeleteEcdc';
import { useHardDeleteVisit } from '../../visits/api/useDeleteVisit';
import '../../../styles/deleted-records.css';

type Tab = 'practitioners' | 'ecdcs' | 'visits';

export default function DeletedRecords() {
  const [activeTab, setActiveTab] = useState<Tab>('practitioners');

  return (
    <div className="la-deleted">
      <header className="la-deleted__header">
        <h1 className="la-deleted__title">Deleted Records (Recycle Bin)</h1>
        <p className="la-deleted__subtitle">
          Records soft-deleted by users. Only administrators can permanently delete them here.
        </p>
      </header>

      <div className="la-deleted__tabs">
        {(['practitioners', 'ecdcs', 'visits'] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`la-deleted__tab${activeTab === tab ? ' la-deleted__tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="la-deleted__body">
        {activeTab === 'practitioners' && <DeletedPractitionersList />}
        {activeTab === 'ecdcs' && <DeletedEcdcsList />}
        {activeTab === 'visits' && <DeletedVisitsList />}
      </div>
    </div>
  );
}

// Shared confirmation row
interface ConfirmActionsProps {
  id: string;
  confirmingId: string | null;
  setConfirmingId: (id: string | null) => void;
  onHardDelete: (id: string) => void;
  isPending: boolean;
}

function ConfirmActions({
  id,
  confirmingId,
  setConfirmingId,
  onHardDelete,
  isPending,
}: ConfirmActionsProps) {
  if (confirmingId === id) {
    return (
      <div className="la-deleted__confirm">
        <span className="la-deleted__confirm-label">Permanently delete?</span>
        <button
          className="la-deleted__btn la-deleted__btn--danger"
          disabled={isPending}
          onClick={() => {
            onHardDelete(id);
            setConfirmingId(null);
          }}
        >
          {isPending ? 'Deleting...' : 'Yes, Delete'}
        </button>
        <button className="la-deleted__btn" onClick={() => setConfirmingId(null)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="la-deleted__actions">
      <button
        className="la-deleted__btn la-deleted__btn--danger"
        onClick={() => setConfirmingId(id)}
      >
        Hard Delete
      </button>
    </div>
  );
}

// List Components
function DeletedPractitionersList() {
  const { data = [], isLoading } = useDeletedPractitioners();
  const { mutate: hardDelete, isPending: hardPending } = useHardDeletePractitioner();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (isLoading) return <div className="la-deleted__loading">Loading...</div>;
  if (data.length === 0) return <div className="la-deleted__empty">No deleted practitioners</div>;

  return (
    <table className="la-deleted__table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Deleted At</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {data.map((p) => (
          <tr key={p.id} className="la-deleted__row">
            <td>{p.name ?? '—'}</td>
            <td>{p.deleted_at ? new Date(p.deleted_at).toLocaleDateString() : '—'}</td>
            <td>
              <ConfirmActions
                id={p.id}
                confirmingId={confirmingId}
                setConfirmingId={setConfirmingId}
                onHardDelete={hardDelete}
                isPending={hardPending}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DeletedEcdcsList() {
  const { data = [], isLoading } = useDeletedEcdcs();
  const { mutate: hardDelete, isPending: hardPending } = useHardDeleteEcdc();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (isLoading) return <div className="la-deleted__loading">Loading...</div>;
  if (data.length === 0) return <div className="la-deleted__empty">No deleted ECDCs</div>;

  return (
    <table className="la-deleted__table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Area</th>
          <th>Deleted At</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {data.map((e) => (
          <tr key={e.id} className="la-deleted__row">
            <td>{e.name ?? '—'}</td>
            <td>{e.area ?? '—'}</td>
            <td>{e.deleted_at ? new Date(e.deleted_at).toLocaleDateString() : '—'}</td>
            <td>
              <ConfirmActions
                id={e.id}
                confirmingId={confirmingId}
                setConfirmingId={setConfirmingId}
                onHardDelete={hardDelete}
                isPending={hardPending}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DeletedVisitsList() {
  const { data = [], isLoading } = useDeletedVisits();
  const { mutate: hardDelete, isPending: hardPending } = useHardDeleteVisit();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (isLoading) return <div className="la-deleted__loading">Loading...</div>;
  if (data.length === 0) return <div className="la-deleted__empty">No deleted visits</div>;

  return (
    <table className="la-deleted__table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Type</th>
          <th>Deleted At</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {data.map((v) => (
          <tr key={v.id} className="la-deleted__row">
            <td>{v.date ?? '—'}</td>
            <td>{v.outreach_type ?? '—'}</td>
            <td>{v.deleted_at ? new Date(v.deleted_at).toLocaleDateString() : '—'}</td>
            <td>
              <ConfirmActions
                id={v.id}
                confirmingId={confirmingId}
                setConfirmingId={setConfirmingId}
                onHardDelete={hardDelete}
                isPending={hardPending}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}