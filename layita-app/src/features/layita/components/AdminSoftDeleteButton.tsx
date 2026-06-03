import React, { useState } from 'react';
import { useAuth } from '../../auth/useAuth'; 

interface AdminSoftDeleteButtonProps {
  onConfirm: () => void;
  isPending: boolean;
  label?: string;
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
    >
      {label}
    </button>
  );
}