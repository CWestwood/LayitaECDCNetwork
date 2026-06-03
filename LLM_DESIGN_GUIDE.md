# Layita ECDC Network — LLM Design Guide

## Purpose
This document outlines the fundamental design requirements, architectural patterns, and conventions for the Layita ECDC Network application. Use this guide when prompting an LLM to add new features or debug existing functionality.

**Target Users:** Monitoring & Evaluation (M&E) staff in rural areas tracking Early Childhood Development Centers (ECDCs).

**Core Design Philosophy:** Simple, user-friendly, low-bandwidth, mobile-friendly interfaces focused on data collection, tracking, and reporting.

---

## 1. Architecture Overview

### Tech Stack
- **Frontend Framework:** React 19 with TypeScript
- **Build Tool:** Vite
- **Routing:** React Router v7
- **State Management:** React Query (@tanstack/react-query) for server state
- **Backend/Database:** Supabase (PostgreSQL + PostGIS for geo data)
- **Mapping:** Leaflet + React-Leaflet (geographic visualization)
- **Export:** XLSX (Excel), jsPDF (PDF export), html2canvas (screenshot export)

### Folder Structure
```
layita-app/
├── src/
│   ├── components/          # Legacy/shared UI components
│   ├── config/              # Configuration files
│   ├── features/            # Feature modules (preferred approach)
│   │   ├── auth/           # Authentication & session
│   │   ├── ecdcs/          # ECDC management & map
│   │   ├── practitioners/   # Practitioner tracking
│   │   ├── visits/         # Outreach visit tracking
│   │   └── layita/         # Monitoring dashboard, audit logs, staff
│   ├── hooks/              # Custom React hooks
│   ├── layouts/            # Page layout components (Sidebar, LoadingScreen)
│   ├── lib/                # Utility functions (colors, filters)
│   ├── pages/              # Page-level components (thin wrappers)
│   ├── routes/             # Navigation configuration
│   └── styles/             # Global CSS files
├── public/                 # Static assets
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.js
```

### Page Structure
Pages are minimal containers that delegate to feature modules:
```typescript
// src/pages/PractitionersPage.tsx
import Practitioners from '../features/practitioners';
export default function PractitionersPage() {
  return <Practitioners />;
}
```

---

## 2. Core Concepts & Data Model

### Domain Entities

#### ECDCs (Early Childhood Development Centers)
- **Fields:** id, name, area, latitude, longitude, number_children, chief, headman
- **Purpose:** Geographic centers being tracked
- **Key Operations:** View on map, filter by area/group, export reports

#### Practitioners
- **Fields:** id, name, contact_number1, contact_number2, has_whatsapp, dsd_funded, dsd_registered, group_id, ecdc_id, training (JSON)
- **Purpose:** Staff/volunteers working at ECDCs
- **Key Operations:** View, edit, track training completion, assign to ECDCs, match with groups

#### Practitioner Groups
- **Purpose:** Organizational groupings (e.g., "Group A", "Group B")
- **Associated Data:** Color coding, training tracking per group

#### Outreach Visits
- **Fields:** id, date, outreach_type, outreach_happened, transport_type, transport_cost, transport_km, parents_trained, children_books, comments
- **Purpose:** Track visits made by practitioners to ECDCs or communities
- **Key Operations:** Create, view, filter by date/type, export statistics

#### Training
- **Structure:** JSON field on practitioners (Record<string, boolean>)
- **Purpose:** Track which training modules each practitioner has completed
- **Key Filters:** Has/needs specific training

#### Audit Logs
- **Purpose:** Track all changes to practitioners, ECDCs, and visits for compliance
- **Fields:** table_name, record_id, changed_by_name, changed_at, changed_fields (JSONB)

### Data Flow
1. **Raw Data Entry:** KoboToolbox (external survey tool) sends submissions via webhook
2. **Processing:** Supabase Edge Functions transform and validate data
3. **Storage:** Normalized PostgreSQL tables with RLS (Row-Level Security)
4. **Fetching:** React Query hooks fetch and cache data from Supabase
5. **UI Updates:** React components subscribe to query state

### Deletion Policy

The app uses a **two-tier deletion model**:

| Action | Who | Mechanism | Cascade |
|--------|-----|-----------|---------|
| Soft delete | Admin only | RPC function sets `deleted_at` | No — only marked record |
| Hard delete | Admin only | RPC function removes row | Yes — visits deleted with practitioner |

#### Soft Delete Pattern
Every deletable table has a `deleted_at: timestamptz | null` column.

**All queries must filter this out by default:**
```typescript
const { data, error } = await supabase
  .from('practitioners')
  .select('...')
  .is('deleted_at', null);       // ← Always include this in all fetch hooks
```

**Backend Functions (PostgreSQL RPC):**
- `soft_delete_practitioner(p_id)` — marks practitioner deleted (no cascade)
- `soft_delete_ecdc(e_id)` — marks ECDC deleted (no cascade)
- `soft_delete_outreach_visit(v_id)` — marks visit deleted
- `hard_delete_practitioner(p_id)` — permanently removes practitioner + all related visits (admin only)
- `hard_delete_ecdc(e_id)` — permanently removes ECDC (practitioners become unassigned via FK)
- `hard_delete_outreach_visit(v_id)` — permanently removes visit (admin only)

**Soft delete mutation (admin only):**
```typescript
// src/features/practitioners/api/useDeletePractitioner.ts
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
      toast.warning(`${data.name} marked for deletion. Contact admin to restore.`);
    },
    onError: (error) => {
      toast.error(`Delete failed: ${error.message}`);
    },
  });
}
```

**Hard delete mutation (admin only):**
```typescript
// src/features/practitioners/api/useHardDeletePractitioner.ts
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
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      toast.success(`${data.name} permanently deleted (${data.visits_deleted} visits)`);
    },
    onError: (error) => {
      toast.error(`Permanent delete failed: ${error.message}`);
    },
  });
}
```

**Admin view: Fetch soft-deleted records**
```typescript
// src/features/layita/deleted/api/useDeletedPractitioners.ts
export function useDeletedPractitioners() {
  return useQuery({
    queryKey: ['practitioners', 'deleted'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_deleted_practitioners');
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });
}
```

## 4c. Form Handling

### Standard: react-hook-form
All edit forms use `react-hook-form`. Do not use uncontrolled inputs or ad-hoc 
local state for form fields.

```typescript
import { useForm } from 'react-hook-form';

interface PractitionerFormValues {
  name: string;
  contact_number1: string | null;
  has_whatsapp: boolean;
}

export default function PractitionerEditForm({ practitioner, onClose }: Props) {
  const { mutate: updatePractitioner, isPending } = useUpdatePractitioner();

  const {
    register,
    handleSubmit,
    formState: { errors, dirtyFields, isDirty },
  } = useForm({
    defaultValues: {
      name: practitioner.name ?? '',
      contact_number1: practitioner.contact_number1 ?? '',
      has_whatsapp: practitioner.has_whatsapp ?? false,
    },
  });

  const onSubmit = (values: PractitionerFormValues) => {
    // Only send fields that actually changed
    const changes = Object.fromEntries(
      Object.keys(dirtyFields).map(key => [key, values[key as keyof PractitionerFormValues]])
    );
    updatePractitioner({ id: practitioner.id, changes }, { onSuccess: onClose });
  };

  return (
    
      
      {errors.name && {errors.name.message}}

      
        {isPending ? 'Saving…' : 'Save'}
      
      Cancel
    
  );
}
```

### Key Rules
- **`isDirty` gates the save button** — don't let users save unchanged data
- **`dirtyFields` drives the mutation payload** — only send what changed (cleaner audit logs)
- **`defaultValues` must come from the fetched record** — not hardcoded
- **Never disable Cancel** — users must always be able to exit

### Validation Rules
- Required fields: use `register('field', { required: 'Message' })`
- Phone numbers: `pattern: { value: /^\d+$/, message: 'Numbers only' }`
- Display errors inline below the field, not in a summary at the top

---

## 3. Component Architecture

### File Organization Within Features
Each feature module follows this pattern:

```
features/practitioners/
├── index.tsx                    # Main feature component (the "page" in that feature)
├── types.ts                     # TypeScript interfaces for this feature
├── _components.tsx              # Reusable sub-components & utilities
├── DetailPanel.tsx              # Detail/edit view component (if applicable)
├── PractitionerRow.tsx          # Row/card component (if applicable)
├── PractitionerEditForm.tsx     # Edit form component (if applicable)
└── api/
    ├── usePractitioners.ts      # React Query hook for fetching
    └── useUnmatchedQueue.ts     # Another React Query hook
```

### Component Naming Conventions
- **Feature directories:** kebab-case, descriptive (e.g., `practitioners`, `visits`)
- **Component files:** PascalCase (e.g., `PractitionerRow.tsx`)
- **Hooks:** camelCase, prefixed with `use` (e.g., `usePractitioners.ts`)
- **Utility files:** camelCase or kebab-case (e.g., `_components.tsx`)

### Component Patterns

#### Presentational Components
Keep components focused on rendering UI with minimal business logic:
```typescript
interface Props {
  p: Practitioner;
  selected: boolean;
  onClick: () => void;
}

export default function PractitionerRow({ p, selected, onClick }: Props) {
  return (
    <div className="p2-row" onClick={onClick}>
      <span className="p2-row__name">{p.name}</span>
    </div>
  );
}
```

#### Container Components
Manage data fetching and state orchestration:
```typescript
export default function Practitioners() {
  const { data: practitioners = [], isLoading } = usePractitioners();
  const [selected, setSelected] = useState<Practitioner | null>(null);
  
  return (
    <>
      {practitioners.map(p => (
        <PractitionerRow 
          key={p.id} 
          p={p} 
          selected={selected?.id === p.id}
          onClick={() => setSelected(p)}
        />
      ))}
    </>
  );
}
```

---

## 4. Data Fetching & State Management

### React Query Pattern (Recommended)

All server state goes through React Query. **Never use useState for API data.**

#### Creating a Hook
```typescript
// src/features/practitioners/api/usePractitioners.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../auth/supabaseClient';
import { Practitioner } from '../types';

const fetchPractitioners = async (): Promise<Practitioner[]> => {
  const { data, error } = await supabase
    .from('practitioners')
    .select(`
      id, name, contact_number1, contact_number2, has_whatsapp,
      dsd_funded, dsd_registered, group_id, ecdc_id, training,
      group:group_id (group_name),
      ecdc:ecdc_id (name, area)
    `)
    .order('name');

  if (error) throw new Error(error.message);
  return data as Practitioner[];
};

export function usePractitioners() {
  return useQuery({
    queryKey: ['practitioners'],
    queryFn: fetchPractitioners,
    staleTime: 1000 * 60 * 5,  // 5 minutes
  });
}
```

#### Using the Hook
```typescript
const { data: practitioners = [], isLoading, error } = usePractitioners();

if (isLoading) return <LoadingScreen />;
if (error) return <div>Error loading practitioners</div>;

return practitioners.map(p => <PractitionerRow key={p.id} p={p} />);
```

### Supabase Client Setup
Centralized client for all queries:
```typescript
// src/features/auth/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### Query Keys Convention
- **Simple queries:** `['tableName']` — e.g., `['practitioners']`
- **Filtered queries:** `['tableName', { filter }]` — e.g., `['practitioners', { area: 'North' }]`
- **Scoped queries:** `['module', 'queryName']` — e.g., `['ecdcs', 'withPractitioners']`


## 4b. Data Writing & Mutations

### Core Rule: All writes go through useMutation hooks
Never call supabase directly from a component. Mutations live in `api/` alongside query hooks.

### Audit Logs — Handled by Postgres Triggers
**Do NOT write to `audit_logs` from the frontend.** All changes to `practitioners`, 
`ecdcs`, and `visits` are captured automatically by database triggers. The frontend 
mutation only needs to perform the write — the audit record is created server-side.

### Standard Mutation Pattern
```typescript
// src/features/practitioners/api/useUpdatePractitioner.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../auth/supabaseClient';

export function useUpdatePractitioner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, changes }: { id: string; changes: Partial<Practitioner> }) => {
      const { error } = await supabase
        .from('practitioners')
        .update(changes)
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
    },
  });
}

// Usage in a component
const { mutate: updatePractitioner, isPending } = useUpdatePractitioner();
<button disabled={isPending} onClick={() => updatePractitioner({ id, changes })}>
  {isPending ? 'Saving...' : 'Save'}
</button>

```

### Naming Convention for Mutation Hooks
- `useCreate{Entity}` — insert
- `useUpdate{Entity}` — update
- `useDelete{Entity}` — soft delete (sets deleted_at)
- `useHardDelete{Entity}` — permanent delete, admin only
---

## 5. Styling & UI Patterns

### CSS Architecture
- **Approach:** Component-scoped CSS files (no CSS-in-JS)
- **Methodology:** BEM (Block Element Modifier)
- **Global styles:** `src/styles/shared.css`
- **Feature styles:** Co-located with features (e.g., `src/features/practitioners/index.tsx` uses `src/styles/practitioners.css`)

### CSS Naming Convention
```css
/* Block */
.p2-row { }

/* Element */
.p2-row__name { }
.p2-row__indicator { }

/* Modifier */
.p2-row--selected { }
.p2-row--highlighted { }

/* State classes */
.is-loading { }
.is-error { }
```
### Feature CSS Prefixes
Each feature uses a short prefix to namespace its BEM classes:

| Feature | Prefix | Example |
|---------|--------|---------|
| practitioners | `.pr-` | `.pr-row`, `.pr-row__name` |
| ecdcs / map | `.ec-` | `.ec-map`, `.ec-map__marker` |
| visits | `.vi-` | `.vi-row`, `.vi-topbar` |
| layita / monitoring | `.la-` | `.la-chart`, `.la-stat` |
| shared / global | `.lyt-` | `.lyt-page`, `.lyt-spinner` |

> **Note:** Existing practitioners code uses `.p2-` (legacy). New components in 
> that feature should use `.pr-`. Do not use `.p2-` for any other feature.

### Layout Patterns

#### Two-Column Layout (Sidebar + Content)
```typescript
export default function Practitioners() {
  return (
    <div className="p2-page">
      <Sidebar />
      <div className="p2-main">
        <header className="p2-topbar">
          <h1>Practitioners</h1>
        </header>
        <div className="p2-body">
          {/* Content */}
        </div>
      </div>
    </div>
  );
}
```

#### Color System
- **Group colors:** Defined in `src/lib/Groupcolors.js`
  ```typescript
  const resolveGroupColor = (groupName: string) => ({
    fill: '#...',
    text: '#...'
  });
  ```
- **Theme colors:** `src/lib/layita_colors.js`
  - Primary brand colors
  - Status colors (success, error, warning)
  - Neutral grays

#### Responsive Design
- **Mobile-first approach**
- Media queries in feature-specific CSS
- Collapse sidebar on small screens
- Use grid/flex for layout flexibility

---

## 6. Routing & Navigation

### Route Structure
```typescript
// src/App.tsx
<BrowserRouter>
  <Routes>
    {/* Public */}
    <Route path="/login" element={<LoginPage />} />

    {/* Protected */}
    <Route element={<ProtectedRoute />}>
      <Route path="/map" element={<ECDCMapPage />} />
      <Route path="/practitioners" element={<PractitionersPage />} />
      <Route path="/visits" element={<OutreachVisitsPage />} />
      
      {/* Admin-only */}
      <Route element={<AdminRoute />}>
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/staff" element={<StaffManagement />} />
      </Route>
    </Route>
  </Routes>
</BrowserRouter>
```

### Navigation Items
```typescript
// src/routes/Navitems.tsx
export const NAV_ITEMS = [
  { to: '/map', label: 'ECDC Map', icon: <MapIcon />, role: 'all' },
  { to: '/practitioners', label: 'Practitioners', icon: <PersonIcon />, role: 'all' },
  { to: '/visits', label: 'Outreach Visits', icon: <VisitIcon />, role: 'all' },
  { to: '/monitor', label: 'Monitoring', icon: <ChartIcon />, role: 'all' },
  { to: '/audit', label: 'Audit Logs', icon: <AuditIcon />, role: 'admin' },
  { to: '/staff', label: 'Staff Management', icon: <SettingsIcon />, role: 'admin' },
];
```

---

## 7. Authentication & Authorization

### User Roles
- **User:** Can view and edit their assigned data
- **Administrator:** Can view all data, manage users, access audit logs

### Auth Hook
```typescript
// src/features/auth/useAuth.ts
interface AuthState {
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Hydrate from Supabase session on mount
  // Listen to auth state changes
}
```

### Protected Routes
```typescript
function ProtectedRoute() {
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function AdminRoute() {
  const { session, loading, isAdmin } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session || !isAdmin) return <Navigate to="/map" replace />;
  return <Outlet />;
}
```

---

## 8. Key Patterns & Conventions

### URL Search Parameters for State
Filters, sorting, and selections are preserved in URL:
```typescript
// Get search params from URL
const [searchParams, setSearchParams] = useSearchParams();

// Apply filters
const pParam = searchParams.get('practitioners');
const eParam = searchParams.get('ecdcs');

// Update URL
setSearchParams(prev => {
  prev.set('area', 'North');
  return prev;
});
```

**Benefits:**
- Shareable links with state
- Browser back/forward works
- Session-preserved filtering

### Multi-Select Pattern
Many pages support multi-selection for bulk operations:
```typescript
const [selectMode, setSelectMode] = useState(false);
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

const toggleSelected = (id: string) => {
  const next = new Set(selectedIds);
  next.has(id) ? next.delete(id) : next.add(id);
  setSelectedIds(next);
};

// Export selected records
if (selectedIds.size > 0) {
  exportAsExcel(Array.from(selectedIds));
}
```

### Filter & Search Pattern
```typescript
const [search, setSearch] = useState('');
const [activeFilters, setActiveFilters] = useState<string[]>([]);

const filtered = useMemo(() => {
  return practitioners.filter(p => {
    const matchesSearch = !search || p.name?.toLowerCase().includes(search.toLowerCase());
    const matchesFilters = activeFilters.length === 0 || 
                          activeFilters.includes(p.group?.group_name);
    return matchesSearch && matchesFilters;
  });
}, [practitioners, search, activeFilters]);
```

### Loading States
Use `isLoading` from React Query:
```typescript
if (isLoading) return <LoadingScreen />;  // Full page
if (subLoading) return <div className="p2-loading"><Spinner /></div>;  // Inline
```

### Empty States
Always provide meaningful empty state UI:
```typescript
if (!practitioners.length) {
  return <div className="p2-empty">No practitioners found</div>;
}
```

### Error Handling
Catch and display errors gracefully:
```typescript
const { data, error } = usePractitioners();

if (error) {
  return <div className="p2-error">Failed to load practitioners: {error.message}</div>;
}
```
## 8b. Notifications & User Feedback

### Standard: sonner
All user-facing feedback for mutations uses `sonner`. Do not use `alert()`, 
`console.log()`, or custom notification state.

**Setup (already in main.tsx):**
```typescript
import { Toaster } from 'sonner';
// In App.tsx root:

```

**Usage in mutation hooks:**
```typescript
import { toast } from 'sonner';

onSuccess: () => {
  toast.success('Practitioner updated');
},
onError: (error) => {
  toast.error(`Save failed: ${error.message}`);
},
```

### When to use each toast type
| Type | When |
|------|------|
| `toast.success()` | Record saved, visit logged, export complete |
| `toast.error()` | Mutation failed — always show the error message |
| `toast.info()` | Neutral state changes (e.g. "Copied to clipboard") |
| `toast.warning()` | Soft delete — "Practitioner removed. Contact admin to restore." |

### Do not toast for
- Page loads or data fetches (use loading states instead)
- Filter/search changes
- Navigation events

---

## 9. Export & Reporting

### Supported Formats
1. **Excel (.xlsx):** Using `xlsx` library
2. **PDF:** Using `jsPDF` + `html2canvas`
3. **CSV:** Via Excel library (can export as CSV)

### Export Pattern
```typescript
import { exportReportAsExcel, exportReportAsPDF } from './exportUtils';

// Export selected practitioners
const handleExport = (format: 'excel' | 'pdf') => {
  const data = practitioners.filter(p => selectedIds.has(p.id));
  format === 'excel' 
    ? exportReportAsExcel(data, 'practitioners.xlsx')
    : exportReportAsPDF(data, 'practitioners.pdf');
};
```

---

## 10. LLM Prompting Guidelines

### Non-Negotiable Rules for LLM Agents
Before writing any code, confirm these rules are followed:

1. **Never write to `audit_logs` from the frontend.** Triggers handle this.
2. **Never soft or hard delete from user-facing UI** (only admins can delete). Check `isAdmin` before showing delete buttons.
3. **Always use RPC functions for deletes:** `soft_delete_practitioner()`, `hard_delete_practitioner()`, etc. Never directly update/delete rows.
4. **Never fetch records without `.is('deleted_at', null)`** unless it's an admin view of deleted records (use `rpc('get_deleted_practitioners')`).
5. **Never use uncontrolled inputs or ad-hoc form state.** Use `react-hook-form`.
6. **Always show a `toast` on mutation success and error.** Use `sonner`.
7. **Never add components to `src/components/`.** It is legacy.
8. **Never use `useState` for server data.** Use React Query.

### How to Ask for Features

#### 1. Always Include Context
Provide the workspace structure and relevant files:
```
I'm working on the Layita ECDC Network application (React + TypeScript + Supabase).
Current structure: src/features/{auth,ecdcs,practitioners,visits,layita}

I need to add [feature description].
```

#### 2. Specify Type of Change
Be clear about what you're building:
```
Add a new page? → Provide types.ts and hook pattern
Add a new hook? → Show existing hooks in the feature
Edit existing component? → Provide current component code
Add styling? → Reference existing CSS in the feature
```

#### 3. Include Relevant Context
- **For new features:** Explain the business logic
- **For data changes:** Describe the new fields/types
- **For UI changes:** Mention where it appears (sidebar, modal, etc.)

#### 4. Reference Design Principles
Remind the LLM of constraints:
```
Remember: This is for M&E staff in rural areas. Keep UI simple, minimal clicks, 
quick to load. Use existing color/component patterns. Mobile-friendly.
```

### Example Prompts

#### Adding a New Data Type
```
I need to track a new entity called "Benchmarks" in the Layita app.
- Benchmarks belong to areas and have: name, target_value, actual_value, achieved_date
- I need:
  1. TypeScript interface in src/features/layita/types.ts
  2. React Query hook src/features/layita/api/useBenchmarks.ts
  3. A simple list view to display and edit benchmarks

Follow the existing patterns in usePractitioners.ts and PractitionerRow.tsx.
```

#### Adding a New Page
```
Create a new "Benchmarks" page for administrators.
- Route: /benchmarks
- Should list all benchmarks with filter by area
- Multi-select to export as Excel
- Follow the pattern in src/features/practitioners/index.tsx
- Add to NAV_ITEMS as admin-only
```

#### Bug Fix
```
The visit filter on the ECDCs map is not persisting when navigating away and back.
The filter state is managed in src/features/ecdcs/index.tsx (visitPreset state).
I think the issue is that visitPreset is not saved to URL search params.
Check src/pages/ECDCMapPage.tsx and suggest fixes.
```

---

## 11. Common Tasks & Patterns

### Task: Add a New Filter
```typescript
// 1. Add state
const [newFilter, setNewFilter] = useState<string[]>([]);

// 2. Add to filtered/computed data
const filtered = useMemo(() => {
  return data.filter(item => {
    if (newFilter.length > 0 && !newFilter.includes(item.filterField)) return false;
    return true;
  });
}, [data, newFilter]);

// 3. Add to UI
<select onChange={(e) => setNewFilter([e.target.value])}>
  {/* options */}
</select>

// 4. (Optional) Persist to URL
setSearchParams(prev => {
  prev.set('filter', newFilter.join(','));
  return prev;
});
```

### Task: Add a New Column to a Table
```typescript
// 1. Update type in types.ts
export interface Practitioner {
  // ... existing fields
  newField: string;
}

// 2. Update query in useHook.ts
.select(`id, name, ..., newField`)

// 3. Update component JSX
<div className="p2-row__new-field">{p.newField}</div>

// 4. Add CSS to styles file
.p2-row__new-field {
  flex: 0 0 150px;
  /* styles */
}
```

### Task: Add Export Format
```typescript
// 1. Create utility function in exportUtils.ts
export function exportReportAsJSON(data: Practitioner[]) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadFile(blob, 'report.json');
}

// 2. Add button in UI
<button onClick={() => exportReportAsJSON(selected)}>
  Export as JSON
</button>
```

---

## 12. Performance Considerations

### Optimization Tips
1. **Memoize expensive computations:**
   ```typescript
   const filtered = useMemo(() => 
     practitioners.filter(...), 
     [practitioners, filters]
   );
   ```

2. **Lazy load components:**
   ```typescript
   const DetailPanel = lazy(() => import('./DetailPanel'));
   ```

3. **Use React Query's caching:**
   - Set `staleTime` to cache data
   - Use `gcTime` to control how long unused queries stay in memory

4. **Avoid unnecessary renders:**
   - Use `useCallback` for event handlers passed to child components
   - Break components into smaller pieces with their own queries

5. **Minimize data fetching:**
   - Select only needed fields in Supabase queries
   - Use lightweight queries for list views, full queries for detail views

---

## 13. TypeScript Conventions

### Type Files Organization
```typescript
// src/features/practitioners/types.ts
export interface Practitioner {
  id: string;
  name: string | null;  // Nullable fields from DB
  contact_number1: string | null;
  ecdc: { name: string; area: string | null } | null;  // Nested objects
  training: Record<string, boolean> | null;  // JSON fields
}

export interface PractitionerWithStats extends Practitioner {
  lastVisit: string | null;  // Augmented data
  daysSinceVisit: number;
}
```

### Type Naming
- Interfaces: PascalCase, descriptive (e.g., `Practitioner`, `EcdcWithPractitioners`)
- Unions: Use `|` for simple types, create named types for complex
- Generics: Use single uppercase letters (T, K, V) or descriptive (TData, TFilter)

---

## 14. Development Workflow

### Before Asking LLM to Build Something
1. ✅ Understand the data model (types.ts)
2. ✅ Check existing similar features
3. ✅ Decide: new page? new hook? new component?
4. ✅ List all files that need to be created/modified

### After Getting LLM Response
1. ✅ Review types match existing patterns
2. ✅ Verify hooks follow React Query pattern
3. ✅ Check CSS uses BEM naming
4. ✅ Test with actual data
5. ✅ Verify routing/navigation work
6. ✅ Test on mobile viewport

### Testing Checklist
- [ ] Component renders without errors
- [ ] Data loads correctly
- [ ] Filters/search work
- [ ] Export functions work
- [ ] Navigation works
- [ ] Mobile responsive
- [ ] Accessibility (keyboard nav, ARIA labels)

---

## 15. Glossary

| Term | Definition |
|------|-----------|
| **ECDC** | Early Childhood Development Center — primary tracking entity |
| **Practitioner** | Staff/volunteer working at/with ECDCs |
| **Outreach Visit** | Tracked instance of a practitioner visiting an ECDC or community |
| **Group** | Organizational grouping of practitioners (e.g., for training cohorts) |
| **M&E** | Monitoring & Evaluation — primary user group |
| **RLS** | Row-Level Security — Supabase feature for data access control |
| **React Query** | Server state management library (now called TanStack Query) |
| **BEM** | Block Element Modifier — CSS naming methodology |
| **Stale Time** | How long React Query considers cached data "fresh" |

---

## 16. Resources & Links

- **Repository:** `c:\Users\westw\OneDrive\Documents\GitHub\LayitaECDCNetwork`
- **Supabase Docs:** https://supabase.com/docs
- **React Query Docs:** https://tanstack.com/query/latest
- **Leaflet Docs:** https://leafletjs.com/
- **TypeScript:** https://www.typescriptlang.org/docs/

---

## Summary

When working with an LLM to add features to Layita:

1. **Use feature modules** — Organize code in `src/features/{featureName}/`
2. **Follow React Query patterns** — No useState for API data
3. **Keep UI simple** — Design for M&E staff, rural areas, mobile devices
4. **Use TypeScript** — Strict typing prevents bugs
5. **Style with BEM CSS** — Keep CSS in feature directories, co-located with components
6. **Test thoroughly** — Mobile, accessibility, error cases
7. **Preserve URLs** — Use search params for filters/state
8. **Document as you go** — Comments for complex logic, type annotations for clarity

---

**Last Updated:** June 2026
**Maintained By:** Development Team
**Version:** 1.0
