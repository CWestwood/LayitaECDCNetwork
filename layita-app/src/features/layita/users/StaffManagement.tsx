// src/features/layita/users/StaffManagement.tsx

import React, { useState, useEffect } from 'react';
import { CloseIcon } from '../../ecdcs/_components';

import type { Database } from '../../../types/database.generated';
import type { AppRole } from '../../auth/capabilities';
import { addStaffManagementItem, fetchStaffManagementData, removeStaffManagementItem } from './api/staffManagement';

import '../../../styles/shared.css';
import '../../../styles/ecdcMap.css';

export default function StaffManagement() {
  const [profiles, setProfiles] = useState<Database['public']['Tables']['profiles']['Row'][]>([]);
  const [layitaStaff, setLayitaStaff] = useState<Database['public']['Tables']['layita_staff']['Row'][]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'profiles' | 'staff'>('profiles');
  const [search, setSearch] = useState('');

  // Removal Modal State
  const [isRemoveModalOpen, setRemoveModalOpen] = useState(false);
  const [itemToRemove, setItemToRemove] = useState<{ id: string, name: string, type: 'profile' | 'staff' } | null>(null);
  const [removeConfirmText, setRemoveConfirmText] = useState('');

  // Add Modal State
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemRole, setNewItemRole] = useState<AppRole>('datacapturer');

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await fetchStaffManagementData();
      setProfiles(data.profiles);
      setLayitaStaff(data.staff);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRemove = async () => {
    if (!itemToRemove || removeConfirmText !== itemToRemove.name) return;

    try {
      await removeStaffManagementItem(itemToRemove.type, itemToRemove.id);
      setRemoveModalOpen(false);
      setItemToRemove(null);
      setRemoveConfirmText('');
      fetchData();
    } catch (error) {
      console.error("Error removing item:", error);
      alert("Failed to remove. Please check permissions and database constraints.");
    }
  };

  const handleAdd = async () => {
    if (!newItemName.trim()) return;

    try {
      await addStaffManagementItem(activeTab === 'staff' ? 'staff' : 'profile', newItemName.trim(), newItemRole);
      setAddModalOpen(false);
      setNewItemName('');
      fetchData();
    } catch (error) {
      console.error("Error adding item:", error);
      alert("Failed to add. Please check permissions and constraints.");
    }
  };

  const activeData = activeTab === 'profiles' ? profiles : layitaStaff;
  const filteredData = activeData.filter(item =>
    (item.name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page">

      {/* Reuse ecdc-map-area styles but adjust layout for a central panel format */}
      <div className="ecdc-map-area" style={{ background: '#f4f5f7', display: 'flex', justifyContent: 'center', padding: '2rem', overflowY: 'auto' }}>

        <div className="ecdc-panel" style={{ position: 'relative', top: 0, left: 0, bottom: 'auto', width: '100%', maxWidth: '800px', height: '100%', maxHeight: '800px', display: 'flex', flexDirection: 'column', margin: '0 auto', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
          <div className="ecdc-panel__header">
            <h2>Admin: Staff & Profiles</h2>
            <button
              className="ecdc-select-toggle ecdc-select-toggle--active"
              onClick={() => setAddModalOpen(true)}
              title="Add New Entry"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '6px' }}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add New
            </button>
          </div>

          {/* Tabs */}
          <div className="ecdc-filter-section" style={{ borderBottom: '1px solid #e1e4e8', paddingBottom: '10px' }}>
            <div className="ecdc-filter-mode" style={{ margin: '10px 16px' }}>
              <button
                className={`ecdc-filter-mode-btn${activeTab === 'profiles' ? ' ecdc-filter-mode-btn--active' : ''}`}
                onClick={() => setActiveTab('profiles')}
              >
                Profiles
              </button>
              <button
                className={`ecdc-filter-mode-btn${activeTab === 'staff' ? ' ecdc-filter-mode-btn--active' : ''}`}
                onClick={() => setActiveTab('staff')}
              >
                Layita Staff
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="ecdc-search-wrap" style={{ margin: '16px' }}>
            <svg className="ecdc-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              className="ecdc-search-input"
              placeholder={`Search ${activeTab === 'profiles' ? 'profiles' : 'staff'}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* List Content */}
          <div className="ecdc-list" style={{ flex: 1, overflowY: 'auto' }}>
            {loading && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                <div className="spinner spinner--md" style={{ display: 'inline-block', marginBottom: '10px' }} />
                <div>Loading data...</div>
              </div>
            )}
            {!loading && filteredData.map((item) => (
              <div key={item.id} className="ecdc-item" style={{ cursor: 'default' }}>
                <div className="ecdc-item__body" style={{ flex: 1 }}>
                  <div className="ecdc-item__top">
                    <div className="ecdc-item__name">{item.name || 'Unnamed'}</div>
                  </div>
                  {activeTab === 'profiles' && item.role && (
                    <div className="ecdc-item__area" style={{ textTransform: 'capitalize' }}>
                      Role: {item.role}
                    </div>
                  )}
                </div>
                <button
                  className="ecdc-report-centre__remove"
                  style={{ cursor: 'pointer', background: 'transparent', border: 'none', color: '#999', alignSelf: 'center', padding: '8px' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setItemToRemove({ id: item.id, name: item.name || 'Unnamed', type: activeTab === 'profiles' ? 'profile' : 'staff' });
                    setRemoveConfirmText('');
                    setRemoveModalOpen(true);
                  }}
                  title={`Remove ${activeTab === 'profiles' ? 'Profile' : 'Staff'}`}
                >
                  <CloseIcon />
                </button>
              </div>
            ))}
            {!loading && filteredData.length === 0 && (
              <div style={{ padding: '16px', color: '#666', fontSize: '0.83rem', textAlign: 'center' }}>
                No entries found.
              </div>
            )}
          </div>
        </div>

        {/* Remove Confirm Modal */}
        {isRemoveModalOpen && itemToRemove && (
          <div className="ecdc-report-overlay" style={{ zIndex: 1000 }} onClick={() => setRemoveModalOpen(false)}>
            <div className="ecdc-report-drawer" style={{ width: '400px', margin: 'auto', left: 0, right: 0, top: '20vh', height: 'auto', bottom: 'auto', borderRadius: '8px', position: 'absolute' }} onClick={(e) => e.stopPropagation()}>
              <div className="ecdc-report-drawer__header">
                <div className="ecdc-report-drawer__title" style={{ color: '#d32f2f' }}>
                  ⚠ Confirm Removal
                </div>
                <button className="ecdc-report-drawer__close" onClick={() => setRemoveModalOpen(false)}>✕</button>
              </div>
              <div className="ecdc-report-drawer__body" style={{ padding: '20px' }}>
                <p style={{ marginBottom: '15px', fontSize: '0.9rem', lineHeight: '1.4' }}>
                  Are you sure you want to remove <strong>{itemToRemove.name}</strong> from the <strong>{itemToRemove.type === 'profile' ? 'Profiles' : 'Layita Staff'}</strong> list? This action cannot be undone.
                </p>
                <p style={{ marginBottom: '8px', fontSize: '0.85rem', color: '#666' }}>
                  To confirm, please type the name exactly as shown above:
                </p>
                <input
                  type="text"
                  className="ecdc-search-input"
                  style={{ width: '100%', marginBottom: '20px', border: '1px solid #d1d9e0', padding: '10px', borderRadius: '4px' }}
                  value={removeConfirmText}
                  onChange={(e) => setRemoveConfirmText(e.target.value)}
                  placeholder={itemToRemove.name}
                />
                <button
                  className="ecdc-select-toolbar__btn ecdc-select-toolbar__btn--primary"
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: removeConfirmText === itemToRemove.name ? '#d32f2f' : '#e0e0e0',
                    color: removeConfirmText === itemToRemove.name ? '#fff' : '#999',
                    borderColor: removeConfirmText === itemToRemove.name ? '#b71c1c' : '#ccc',
                    cursor: removeConfirmText === itemToRemove.name ? 'pointer' : 'not-allowed'
                  }}
                  disabled={removeConfirmText !== itemToRemove.name}
                  onClick={handleRemove}
                >
                  Remove {itemToRemove.type === 'profile' ? 'Profile' : 'Staff'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Modal */}
        {isAddModalOpen && (
          <div className="ecdc-report-overlay" style={{ zIndex: 1000 }} onClick={() => setAddModalOpen(false)}>
            <div className="ecdc-report-drawer" style={{ width: '400px', margin: 'auto', left: 0, right: 0, top: '20vh', height: 'auto', bottom: 'auto', borderRadius: '8px', position: 'absolute' }} onClick={(e) => e.stopPropagation()}>
              <div className="ecdc-report-drawer__header">
                <div className="ecdc-report-drawer__title">
                  Add New {activeTab === 'profiles' ? 'Profile' : 'Layita Staff'}
                </div>
                <button className="ecdc-report-drawer__close" onClick={() => setAddModalOpen(false)}>✕</button>
              </div>
              <div className="ecdc-report-drawer__body" style={{ padding: '20px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Name</label>
                <input
                  type="text"
                  className="ecdc-search-input"
                  style={{ width: '100%', marginBottom: '20px', border: '1px solid #d1d9e0', padding: '10px', borderRadius: '4px' }}
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="Enter full name"
                />
                {activeTab === 'profiles' && (
                  <>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Role</label>
                    <select
                      className="ecdc-search-input"
                      style={{ width: '100%', marginBottom: '20px', border: '1px solid #d1d9e0', padding: '10px', borderRadius: '4px', background: '#fff' }}
                      value={newItemRole}
                      onChange={(e) => setNewItemRole(e.target.value as AppRole)}
                    >
                      <option value="datacapturer">Data Capturer</option>
                      <option value="manager">Manager</option>
                      <option value="administrator">Administrator</option>
                    </select>
                  </>
                )}
                <button
                  className="ecdc-select-toolbar__btn ecdc-select-toolbar__btn--primary"
                  style={{ width: '100%', padding: '10px', opacity: !newItemName.trim() ? 0.6 : 1, cursor: !newItemName.trim() ? 'not-allowed' : 'pointer' }}
                  disabled={!newItemName.trim()}
                  onClick={handleAdd}
                >
                  Save {activeTab === 'profiles' ? 'Profile' : 'Staff'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
