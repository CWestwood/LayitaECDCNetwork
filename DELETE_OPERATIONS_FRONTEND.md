# Delete Operations — Frontend Implementation Examples

**Purpose:** Show how to implement React Query mutation hooks for the delete RPC functions.

**Backend Functions Available:**
- `soft_delete_practitioner(p_id)` — Admin only
- `soft_delete_ecdc(e_id)` — Admin only  
- `soft_delete_outreach_visit(v_id)` — Admin only
- `hard_delete_practitioner(p_id)` — Admin only, requires soft-deleted record
- `hard_delete_ecdc(e_id)` — Admin only, requires soft-deleted record
- `hard_delete_outreach_visit(v_id)` — Admin only, requires soft-deleted record
- `get_deleted_practitioners()` — Admin only, returns soft-deleted records
- `get_deleted_ecdcs()` — Admin only, returns soft-deleted records
- `get_deleted_outreach_visits()` — Admin only, returns soft-deleted records

---

## 1. Practitioner Delete Hooks

### Create: `src/features/practitioners/api/useDeletePractitioner.ts`

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../auth/supabaseClient';
import { toast } from 'sonner';

export function useDeletePractitioner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc(
        'soft_delete_practitioner',
        { p_id: id }
      );

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      queryClient.invalidateQueries({ queryKey: ['ecdcs', 'withPractitioners'] });
      toast.warning(`${data.name} marked for deletion. Contact administrator to restore.`);
    },
    onError: (error) => {
      toast.error(`Delete failed: ${error.message}`);
    },
  });
}

export function useHardDeletePractitioner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc(
        'hard_delete_practitioner',
        { p_id: id }
      );

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['practitioners', 'deleted'] });
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      toast.success(
        `${data.name} permanently deleted (${data.visits_deleted} visits removed)`
      );
    },
    onError: (error) => {
      toast.error(`Permanent delete failed: ${error.message}`);
    },
  });
}
```

### Usage in Component

```typescript
// src/features/practitioners/index.tsx
import { useAuth } from '../auth/useAuth';
import { useDeletePractitioner } from './api/useDeletePractitioner';

export default function Practitioners() {
  const { isAdmin } = useAuth();
  const { mutate: deletePractitioner, isPending } = useDeletePractitioner();

  const handleDelete = (id: string, name: string) => {
    if (!window.confirm(`Remove ${name} from the system? This can be undone by an administrator.`)) {
      return;
    }
    deletePractitioner(id);
  };

  return (
    <>
      {practitioners.map(p => (
        <div key={p.id}>
          {/* ... practitioner display ... */}
          {isAdmin && (
            <button 
              onClick={() => handleDelete(p.id, p.name || 'Practitioner')}
              disabled={isPending}
              className="pr-action-btn pr-action-btn--delete"
            >
              {isPending ? 'Removing...' : 'Remove'}
            </button>
          )}
        </div>
      ))}
    </>
  );
}
```

---

## 2. ECDC Delete Hooks

### Create: `src/features/ecdcs/api/useDeleteEcdc.ts`

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../auth/supabaseClient';
import { toast } from 'sonner';

export function useDeleteEcdc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc(
        'soft_delete_ecdc',
        { e_id: id }
      );

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ecdcs'] });
      queryClient.invalidateQueries({ queryKey: ['ecdcs', 'withPractitioners'] });
      toast.warning(
        `${data.name} marked for deletion (${data.linked_practitioners} practitioners remain assigned)`
      );
    },
    onError: (error) => {
      toast.error(`Delete failed: ${error.message}`);
    },
  });
}

export function useHardDeleteEcdc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc(
        'hard_delete_ecdc',
        { e_id: id }
      );

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ecdcs', 'deleted'] });
      queryClient.invalidateQueries({ queryKey: ['ecdcs'] });
      toast.success(
        `${data.name} permanently deleted (${data.practitioners_unassigned} practitioners unassigned)`
      );
    },
    onError: (error) => {
      toast.error(`Permanent delete failed: ${error.message}`);
    },
  });
}
```

---

## 3. Outreach Visit Delete Hooks

### Create: `src/features/visits/api/useDeleteVisit.ts`

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../auth/supabaseClient';
import { toast } from 'sonner';

export function useDeleteOutreachVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc(
        'soft_delete_outreach_visit',
        { v_id: id }
      );

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['outreach_visits'] });
      toast.warning(`Visit on ${new Date(data.date).toLocaleDateString()} marked for deletion`);
    },
    onError: (error) => {
      toast.error(`Delete failed: ${error.message}`);
    },
  });
}

export function useHardDeleteOutreachVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc(
        'hard_delete_outreach_visit',
        { v_id: id }
      );

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['outreach_visits', 'deleted'] });
      queryClient.invalidateQueries({ queryKey: ['outreach_visits'] });
      toast.success(`Visit on ${new Date(data.date).toLocaleDateString()} permanently deleted`);
    },
    onError: (error) => {
      toast.error(`Permanent delete failed: ${error.message}`);
    },
  });
}
```

---

## 4. Admin Deleted Records Hooks

### Create: `src/features/layita/deleted/api/useDeletedRecords.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../auth/supabaseClient';

export function useDeletedPractitioners() {
  return useQuery({
    queryKey: ['practitioners', 'deleted'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_deleted_practitioners');
      if (error) throw new Error(error.message);
      return data || [];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useDeletedEcdcs() {
  return useQuery({
    queryKey: ['ecdcs', 'deleted'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_deleted_ecdcs');
      if (error) throw new Error(error.message);
      return data || [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useDeletedOutreachVisits() {
  return useQuery({
    queryKey: ['outreach_visits', 'deleted'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_deleted_outreach_visits');
      if (error) throw new Error(error.message);
      return data || [];
    },
    staleTime: 1000 * 60 * 5,
  });
}
```

---

## 5. Admin Deleted Records Component (Example)

### Create: `src/features/layita/deleted/index.tsx`

```typescript
import { useState } from 'react';
import { useDeletedPractitioners, useDeletedEcdcs, useDeletedOutreachVisits } from './api/useDeletedRecords';
import { useHardDeletePractitioner } from '../../practitioners/api/useDeletePractitioner';
import { useHardDeleteEcdc } from '../../ecdcs/api/useDeleteEcdc';
import { useHardDeleteOutreachVisit } from '../../visits/api/useDeleteVisit';
import Sidebar from '../../../layouts/Sidebar';
import '../../../styles/shared.css';

export default function DeletedRecords() {
  const [activeTab, setActiveTab] = useState<'practitioners' | 'ecdcs' | 'visits'>('practitioners');
  
  const { data: deletedPractitioners = [], isLoading: pracLoading } = useDeletedPractitioners();
  const { data: deletedEcdcs = [], isLoading: ecdcLoading } = useDeletedEcdcs();
  const { data: deletedVisits = [], isLoading: visitLoading } = useDeletedOutreachVisits();

  const { mutate: hardDeletePractitioner } = useHardDeletePractitioner();
  const { mutate: hardDeleteEcdc } = useHardDeleteEcdc();
  const { mutate: hardDeleteVisit } = useHardDeleteOutreachVisit();

  const handleHardDelete = (type: string, id: string, name: string) => {
    if (!window.confirm(`Permanently delete "${name}"? This CANNOT be undone.`)) {
      return;
    }
    
    if (type === 'practitioner') {
      hardDeletePractitioner(id);
    } else if (type === 'ecdc') {
      hardDeleteEcdc(id);
    } else if (type === 'visit') {
      hardDeleteVisit(id);
    }
  };

  return (
    <div className="lyt-page">
      <Sidebar />
      <div className="lyt-main">
        <header className="lyt-topbar">
          <h1>Deleted Records</h1>
          <p>Review and permanently delete soft-deleted records</p>
        </header>

        <div className="lyt-tabs">
          <button 
            className={`lyt-tab ${activeTab === 'practitioners' ? 'active' : ''}`}
            onClick={() => setActiveTab('practitioners')}
          >
            Practitioners ({deletedPractitioners.length})
          </button>
          <button 
            className={`lyt-tab ${activeTab === 'ecdcs' ? 'active' : ''}`}
            onClick={() => setActiveTab('ecdcs')}
          >
            ECDCs ({deletedEcdcs.length})
          </button>
          <button 
            className={`lyt-tab ${activeTab === 'visits' ? 'active' : ''}`}
            onClick={() => setActiveTab('visits')}
          >
            Visits ({deletedVisits.length})
          </button>
        </div>

        <div className="lyt-body">
          {activeTab === 'practitioners' && (
            <DeletedPractitionersTab
              data={deletedPractitioners}
              isLoading={pracLoading}
              onHardDelete={(id, name) => handleHardDelete('practitioner', id, name)}
            />
          )}
          {activeTab === 'ecdcs' && (
            <DeletedEcdcsTab
              data={deletedEcdcs}
              isLoading={ecdcLoading}
              onHardDelete={(id, name) => handleHardDelete('ecdc', id, name)}
            />
          )}
          {activeTab === 'visits' && (
            <DeletedVisitsTab
              data={deletedVisits}
              isLoading={visitLoading}
              onHardDelete={(id, name) => handleHardDelete('visit', id, name)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DeletedPractitionersTab({ data, isLoading, onHardDelete }) {
  if (isLoading) return <div className="lyt-loading">Loading deleted practitioners...</div>;
  if (data.length === 0) return <div className="lyt-empty">No deleted practitioners</div>;

  return (
    <table className="lyt-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Deleted At</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {data.map(p => (
          <tr key={p.id}>
            <td>{p.name || '—'}</td>
            <td>{new Date(p.deleted_at).toLocaleDateString()}</td>
            <td>
              <button 
                className="lyt-btn lyt-btn--danger"
                onClick={() => onHardDelete(p.id, p.name)}
              >
                Permanently Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DeletedEcdcsTab({ data, isLoading, onHardDelete }) {
  if (isLoading) return <div className="lyt-loading">Loading deleted ECDCs...</div>;
  if (data.length === 0) return <div className="lyt-empty">No deleted ECDCs</div>;

  return (
    <table className="lyt-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Area</th>
          <th>Deleted At</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {data.map(e => (
          <tr key={e.id}>
            <td>{e.name || '—'}</td>
            <td>{e.area || '—'}</td>
            <td>{new Date(e.deleted_at).toLocaleDateString()}</td>
            <td>
              <button 
                className="lyt-btn lyt-btn--danger"
                onClick={() => onHardDelete(e.id, e.name)}
              >
                Permanently Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DeletedVisitsTab({ data, isLoading, onHardDelete }) {
  if (isLoading) return <div className="lyt-loading">Loading deleted visits...</div>;
  if (data.length === 0) return <div className="lyt-empty">No deleted visits</div>;

  return (
    <table className="lyt-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Type</th>
          <th>Deleted At</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {data.map(v => (
          <tr key={v.id}>
            <td>{new Date(v.date).toLocaleDateString()}</td>
            <td>{v.outreach_type || '—'}</td>
            <td>{new Date(v.deleted_at).toLocaleDateString()}</td>
            <td>
              <button 
                className="lyt-btn lyt-btn--danger"
                onClick={() => onHardDelete(v.id, new Date(v.date).toLocaleDateString())}
              >
                Permanently Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

---

## 6. CSS for Delete Buttons

### Add to: `src/styles/shared.css`

```css
/* Delete action button */
.lyt-btn--danger {
  background-color: #dc3545;
  color: white;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background-color 0.2s;
}

.lyt-btn--danger:hover:not(:disabled) {
  background-color: #c82333;
}

.lyt-btn--danger:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
  opacity: 0.6;
}

/* Or for practitioners/practitioners.css */
.pr-action-btn--delete {
  background-color: #dc3545;
  color: white;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.pr-action-btn--delete:hover:not(:disabled) {
  background-color: #c82333;
}

.pr-action-btn--delete:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
}
```

---

## 7. Integration Checklist

- [ ] Create `src/features/practitioners/api/useDeletePractitioner.ts`
- [ ] Create `src/features/ecdcs/api/useDeleteEcdc.ts`
- [ ] Create `src/features/visits/api/useDeleteVisit.ts`
- [ ] Create `src/features/layita/deleted/api/useDeletedRecords.ts`
- [ ] Create `src/features/layita/deleted/index.tsx`
- [ ] Update all fetch hooks to include `.is('deleted_at', null)`
- [ ] Add delete buttons to practitioner/ECDC/visit list pages (admin only)
- [ ] Add CSS styling for delete buttons
- [ ] Add "Deleted Records" route to `src/routes/Navitems.tsx` (admin only)
- [ ] Test soft delete functionality
- [ ] Test hard delete functionality (from admin panel)

---

## 8. Testing Checklist

| Scenario | Expected Result |
|----------|-----------------|
| Soft delete practitioner as admin | Record hidden from lists, appears in deleted records view |
| Soft delete practitioner as non-admin | Button disabled or hidden |
| Hard delete practitioner as admin | Record permanently removed, all visits deleted |
| Soft delete ECDC | Practitioners remain assigned (not cascaded) |
| Hard delete ECDC | Practitioners become unassigned (FK cascade) |
| Fetch with .is('deleted_at', null) | Only active records returned |
| Fetch deleted records via RPC | Only soft-deleted records returned |
| Hard delete non-soft-deleted record | Error returned |
| Authorization failure | Proper error message shown, toast displayed |
