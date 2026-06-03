# Delete RPC Functions — Quick Reference

**All functions require admin role (enforced by RLS + SECURITY DEFINER)**

---

## Soft Delete Functions

### `soft_delete_practitioner(p_id: uuid)`

**Purpose:** Mark a practitioner as deleted (sets `deleted_at` timestamp)

**Parameters:**
- `p_id` (required, uuid) — Practitioner ID

**Returns:**
```typescript
{
  success: boolean,
  message: string,
  name: string,              // Practitioner name
  deleted_at: timestamp      // When marked deleted
}
// OR
{
  error: string,
  code: string               // 'UNAUTHORIZED' | 'NOT_FOUND'
}
```

**Example Call:**
```typescript
const { data, error } = await supabase.rpc('soft_delete_practitioner', { p_id: 'uuid-here' });
```

**No Cascade:** Only this practitioner is marked deleted. Their outreach_visits remain active.

---

### `soft_delete_ecdc(e_id: uuid)`

**Purpose:** Mark an ECDC as deleted

**Parameters:**
- `e_id` (required, uuid) — ECDC ID

**Returns:**
```typescript
{
  success: boolean,
  message: string,
  name: string,                      // ECDC name
  linked_practitioners: integer,     // Count of practitioners still assigned
  note: string,                       // Informational message
  deleted_at: timestamp
}
// OR
{
  error: string,
  code: string                       // 'UNAUTHORIZED' | 'NOT_FOUND'
}
```

**Example Call:**
```typescript
const { data, error } = await supabase.rpc('soft_delete_ecdc', { e_id: 'uuid-here' });
```

**No Cascade:** Only this ECDC is marked deleted. Practitioners remain assigned (but will see deleted ECDC in their list).

---

### `soft_delete_outreach_visit(v_id: uuid)`

**Purpose:** Mark an outreach visit as deleted

**Parameters:**
- `v_id` (required, uuid) — Visit ID

**Returns:**
```typescript
{
  success: boolean,
  message: string,
  date: date,                // Visit date
  deleted_at: timestamp
}
// OR
{
  error: string,
  code: string               // 'UNAUTHORIZED' | 'NOT_FOUND'
}
```

**Example Call:**
```typescript
const { data, error } = await supabase.rpc('soft_delete_outreach_visit', { v_id: 'uuid-here' });
```

---

## Hard Delete Functions

### `hard_delete_practitioner(p_id: uuid)`

**Purpose:** Permanently remove a practitioner (must be soft-deleted first)

**Parameters:**
- `p_id` (required, uuid) — Practitioner ID

**Returns:**
```typescript
{
  success: boolean,
  message: string,
  name: string,              // Practitioner name
  visits_deleted: integer    // Count of visits hard-deleted
}
// OR
{
  error: string,
  code: string               // 'UNAUTHORIZED' | 'NOT_FOUND'
}
```

**Example Call:**
```typescript
const { data, error } = await supabase.rpc('hard_delete_practitioner', { p_id: 'uuid-here' });
```

**Cascade Behavior:**
1. All outreach_visits for this practitioner are hard-deleted
2. All training records are hard-deleted
3. The practitioner row is deleted

**Precondition:** Record must be soft-deleted (`deleted_at IS NOT NULL`)

---

### `hard_delete_ecdc(e_id: uuid)`

**Purpose:** Permanently remove an ECDC (must be soft-deleted first)

**Parameters:**
- `e_id` (required, uuid) — ECDC ID

**Returns:**
```typescript
{
  success: boolean,
  message: string,
  name: string,                      // ECDC name
  practitioners_unassigned: integer  // Count of practitioners with ecdc_id set to NULL
}
// OR
{
  error: string,
  code: string                       // 'UNAUTHORIZED' | 'NOT_FOUND'
}
```

**Example Call:**
```typescript
const { data, error } = await supabase.rpc('hard_delete_ecdc', { e_id: 'uuid-here' });
```

**Cascade Behavior:**
- All practitioners with `ecdc_id = this_ecdc_id` have `ecdc_id` set to `NULL` (via FK ON DELETE SET NULL)
- The ECDC row is deleted

**Precondition:** Record must be soft-deleted (`deleted_at IS NOT NULL`)

---

### `hard_delete_outreach_visit(v_id: uuid)`

**Purpose:** Permanently remove an outreach visit (must be soft-deleted first)

**Parameters:**
- `v_id` (required, uuid) — Visit ID

**Returns:**
```typescript
{
  success: boolean,
  message: string,
  date: date                 // Visit date
}
// OR
{
  error: string,
  code: string               // 'UNAUTHORIZED' | 'NOT_FOUND'
}
```

**Example Call:**
```typescript
const { data, error } = await supabase.rpc('hard_delete_outreach_visit', { v_id: 'uuid-here' });
```

**Precondition:** Record must be soft-deleted (`deleted_at IS NOT NULL`)

---

## Admin Query Functions

### `get_deleted_practitioners()`

**Purpose:** Fetch all soft-deleted practitioners (admin only)

**Parameters:** None

**Returns:**
```typescript
// Array of practitioners (same schema as practitioners table, but only with deleted_at IS NOT NULL)
[
  {
    id: uuid,
    created_at: timestamp,
    name: string,
    contact_number1: string,
    contact_number2: string,
    ecdc_id: uuid,
    updated_at: timestamp,
    group_id: uuid,
    dsd_funded: boolean,
    dsd_registered: boolean,
    has_whatsapp: boolean,
    group: string,
    status: string,
    deleted_at: timestamp      // ← Always NOT NULL for these results
  },
  // ... more records ordered by deleted_at DESC
]
```

**Example Call:**
```typescript
const { data, error } = await supabase.rpc('get_deleted_practitioners');
```

---

### `get_deleted_ecdcs()`

**Purpose:** Fetch all soft-deleted ECDCs (admin only)

**Parameters:** None

**Returns:**
```typescript
// Array of ECDCs (with deleted_at IS NOT NULL)
[
  {
    id: uuid,
    created_at: timestamp,
    name: string,
    area: string,
    location: geography,       // PostGIS geography type
    longitude: double,
    latitude: double,
    area_id: uuid,
    chief: string,
    headman: string,
    number_children: string,
    attendance_updated: timestamp,
    deleted_at: timestamp      // ← Always NOT NULL
  },
  // ... more records ordered by deleted_at DESC
]
```

**Example Call:**
```typescript
const { data, error } = await supabase.rpc('get_deleted_ecdcs');
```

---

### `get_deleted_outreach_visits()`

**Purpose:** Fetch all soft-deleted outreach visits (admin only)

**Parameters:** None

**Returns:**
```typescript
// Array of outreach visits (with deleted_at IS NOT NULL)
[
  {
    id: uuid,
    created_at: timestamp,
    date: date,
    practitioner_id: uuid,
    outreach_type: string,
    transport_type: string,
    transport_cost: numeric,
    transport_km: numeric,
    parents_trained: numeric,
    children_books: numeric,
    books_per_child: numeric,
    books_to_practitioner: numeric,
    data_capturer_id: uuid,
    photos_taken: boolean,
    comments: string,
    outreach_happened: string,
    did_instead: string,
    parents_enrolled: numeric,
    kobo_instance_id: string,
    source: string,
    people_reached: numeric,
    deleted_at: timestamp      // ← Always NOT NULL
  },
  // ... more records ordered by deleted_at DESC
]
```

**Example Call:**
```typescript
const { data, error } = await supabase.rpc('get_deleted_outreach_visits');
```

---

## Error Handling

All functions return either `{ success, ... }` or `{ error, code }`.

**Always check for errors:**

```typescript
const { data, error } = await supabase.rpc('soft_delete_practitioner', { p_id: id });

if (error) {
  // Network/RPC error
  toast.error(error.message);
  return;
}

if (data?.error) {
  // Business logic error (unauthorized, not found, etc.)
  toast.error(data.error);
  return;
}

// Success
toast.success(data.message);
```

**Error Codes:**
- `UNAUTHORIZED` — User is not admin
- `NOT_FOUND` — Record not found or not in expected state (soft-deleted for hard delete)

---

## React Hook Pattern

```typescript
export function useDeletePractitioner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('soft_delete_practitioner', { p_id: id });
      
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      toast.warning(data.message);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}
```

**Usage:**
```typescript
const { mutate: delete Practitioner, isPending } = useDeletePractitioner();

// In handler:
deletePractitioner(practitionerId);
```

---

## Migration Info

**File:** `supabase/migrations/20260603130000_add_soft_delete_functions.sql`

**To Deploy:**
```bash
supabase db push
```

All functions are automatically GRANTED to `authenticated` role, so any authenticated user can call them. **Authorization is enforced inside the function** by checking `get_my_role()`.
