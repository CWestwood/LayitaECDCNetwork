import React, { useState } from 'react';
import { useAuth } from '../../auth/useAuth'; 

interface AdminSoftDeleteButtonProps {
  onConfirm: () => void;
  isPending: boolean;
  label?: string;
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

export function AdminSoftDeleteButton({
  onConfirm,
  isPending,
  label = 'Delete',
}: AdminSoftDeleteButtonProps) {
  const { isAdmin } = useAuth();
  const [confirming, setConfirming] = useState(false);

  // Only administrators should see the soft-delete option
  if (!isAdmin) return null;

  if (confirming) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '14px', color: '#dc2626', fontWeight: 500 }}>Are you sure?</span>
        <button
          className="lyt-btn lyt-btn--danger"
          disabled={isPending}
          onClick={() => {
            onConfirm();
            setConfirming(false);
          }}
        >
          {isPending ? 'Deleting...' : 'Yes, Delete'}
        </button>
        <button
          className="lyt-btn lyt-btn--secondary"
          onClick={() => setConfirming(false)}
          disabled={isPending}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      className="lyt-btn lyt-btn--danger-outline"
      onClick={() => setConfirming(true)}
      aria-label={label}
      title={label}
    >
      <TrashIcon />
      <span className="lyt-btn__text">{label}</span>
    </button>
  );
}
