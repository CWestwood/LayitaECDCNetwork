import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AppRole } from '../../auth/capabilities';
import { fetchStaffManagementData, runAdminUserAction } from './api/staffManagement';
import type { AdminUserAction, ManagedUser } from './api/staffManagement';
import '../../../styles/shared.css';
import '../../../styles/staff-management.css';

const ROLES: AppRole[] = ['administrator', 'manager', 'datacapturer', 'library'];

export default function StaffManagement() {
  const queryClient = useQueryClient();
  const { data = { users: [], staff: [] }, isLoading, error } = useQuery({ queryKey: ['admin-users'], queryFn: fetchStaffManagementData });
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: 'datacapturer' as AppRole, staffId: '' });

  const action = useMutation({
    mutationFn: (request: AdminUserAction) => runAdminUserAction(request),
    onSuccess: async (_, request) => {
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(request.action === 'reset' ? 'Password reset email sent' : 'User account updated');
    },
    onError: (requestError) => toast.error(requestError.message),
  });

  const visibleUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.users.filter((user) => (showInactive || user.is_active) && (!query || user.name?.toLowerCase().includes(query) || user.email?.toLowerCase().includes(query)));
  }, [data.users, search, showInactive]);

  const beginEdit = (user: ManagedUser) => {
    setEditing(user); setInviteOpen(false);
    setForm({ email: user.email ?? '', name: user.name ?? '', role: user.role, staffId: user.layita_staff_id ?? '' });
  };
  const submit = () => {
    if (!form.name.trim() || (inviteOpen && !form.email.trim())) return;
    const request: AdminUserAction = inviteOpen
      ? { action: 'invite', email: form.email.trim(), name: form.name.trim(), role: form.role, layita_staff_id: form.staffId || null }
      : { action: 'update', user_id: editing!.id, name: form.name.trim(), role: form.role, layita_staff_id: form.staffId || null };
    action.mutate(request, { onSuccess: () => { setEditing(null); setInviteOpen(false); } });
  };
  const openInvite = () => {
    setEditing(null); setInviteOpen(true);
    setForm({ email: '', name: '', role: 'datacapturer', staffId: '' });
  };

  return <div className="page sm-page"><main className="sm-main">
    <header className="sm-header"><div><h1>Staff Management</h1><p>Invite users, link staff records, manage roles, and safely deactivate access.</p></div><button className="lyt-btn sm-primary" onClick={openInvite}>Invite user</button></header>
    <div className="sm-toolbar"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" aria-label="Search users" /><label><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /> Show inactive</label></div>
    {isLoading ? <div className="sm-state">Loading users…</div> : error ? <div className="sm-state" role="alert">{error.message}</div> : <div className="sm-table-wrap"><table className="sm-table">
      <thead><tr><th>User</th><th>Role</th><th>Staff link</th><th>Last sign-in</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{visibleUsers.map((user) => <tr key={user.id}>
        <td><strong>{user.name || 'Unnamed user'}</strong><small>{user.email || 'No email'}</small></td><td>{user.role}</td><td>{data.staff.find((staff) => staff.id === user.layita_staff_id)?.name || 'Not linked'}</td>
        <td>{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : user.invited_at ? 'Invited' : 'Never'}</td><td><span className={`sm-status sm-status--${user.is_active ? 'active' : 'inactive'}`}>{user.is_active ? 'Active' : 'Inactive'}</span></td>
        <td><div className="sm-actions"><button className="lyt-btn" onClick={() => beginEdit(user)}>Edit</button><button className="lyt-btn" disabled={action.isPending || !user.email} onClick={() => action.mutate({ action: 'reset', user_id: user.id })}>Reset password</button><button className="lyt-btn" disabled={action.isPending} onClick={() => action.mutate({ action: user.is_active ? 'deactivate' : 'reactivate', user_id: user.id })}>{user.is_active ? 'Deactivate' : 'Reactivate'}</button></div></td>
      </tr>)}</tbody>
    </table>{visibleUsers.length === 0 && <div className="sm-state">No users match this view.</div>}</div>}
  </main>{(inviteOpen || editing) && <div className="sm-modal-backdrop" onMouseDown={() => { setInviteOpen(false); setEditing(null); }}><section className="sm-modal" role="dialog" aria-modal="true" aria-labelledby="staff-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
    <h2 id="staff-dialog-title">{inviteOpen ? 'Invite user' : 'Edit user'}</h2>{inviteOpen && <label>Email<input type="email" autoFocus value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>}<label>Name<input autoFocus={!inviteOpen} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
    <label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as AppRole })}>{ROLES.map((role) => <option key={role}>{role}</option>)}</select></label><label>Layita staff record<select value={form.staffId} onChange={(event) => setForm({ ...form, staffId: event.target.value })}><option value="">Not linked</option>{data.staff.filter((staff) => staff.is_active).map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}</select></label>
    <div className="sm-modal-actions"><button className="lyt-btn" onClick={() => { setInviteOpen(false); setEditing(null); }}>Cancel</button><button className="lyt-btn sm-primary" disabled={action.isPending} onClick={submit}>{action.isPending ? 'Saving…' : inviteOpen ? 'Send invite' : 'Save changes'}</button></div>
  </section></div>}</div>;
}
