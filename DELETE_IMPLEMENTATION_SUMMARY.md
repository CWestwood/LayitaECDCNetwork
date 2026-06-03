# Delete Functionality — Implementation Summary

**Status:** ✅ Backend Complete | ⏳ Frontend Ready to Build  
**Date:** June 3, 2026

---

## What Has Been Implemented

### Backend (Supabase) ✅ COMPLETE

**Migration File:** `supabase/migrations/20260603130000_add_soft_delete_functions.sql`

#### Schema Changes
- Added `deleted_at: timestamptz` column to:
  - `practitioners`
  - `ecdc_list`
  - `outreach_visits`
- Added indexes on `deleted_at` for query performance
- Default value: `NULL` (not deleted)

#### PostgreSQL Functions (RPC-enabled)

**Soft Delete Functions (Admin Only):**
- `soft_delete_practitioner(p_id)` — Mark practitioner deleted (no cascade)
- `soft_delete_ecdc(e_id)` — Mark ECDC deleted (no cascade)
- `soft_delete_outreach_visit(v_id)` — Mark visit deleted

**Hard Delete Functions (Admin Only):**
- `hard_delete_practitioner(p_id)` — Permanently remove + cascade visits
- `hard_delete_ecdc(e_id)` — Permanently remove + unassign practitioners
- `hard_delete_outreach_visit(v_id)` — Permanently remove visit

**Admin Query Functions (Bypass normal RLS):**
- `get_deleted_practitioners()` — Fetch soft-deleted practitioners
- `get_deleted_ecdcs()` — Fetch soft-deleted ECDCs
- `get_deleted_outreach_visits()` — Fetch soft-deleted visits

#### RLS Policies Updated

All SELECT policies now include `deleted_at IS NULL` filter:
- ✅ `practitioners: authenticated read`
- ✅ `ecdc_list: authenticated read`
- ✅ `outreach_visits: authenticated read`
- ✅ `outreach_visits: datacapturer update own`
- ✅ `outreach_visits: manager update`
- ✅ `practitioners: manager update`

**Result:** Soft-deleted records are automatically hidden from all users (except admins viewing deleted records)

---

## What Needs to be Implemented (Frontend)

### Phase 1: Update All Fetch Hooks ⏳ (HIGH PRIORITY)

Every React Query hook that fetches practitioners, ecdcs, or outreach_visits must add `.is('deleted_at', null)`.

**Files to Update:**
```
src/features/practitioners/api/usePractitioners.ts           ← Add filter
src/features/practitioners/api/useUnmatchedQueue.ts          ← Add filter
src/features/ecdcs/api/useEcdcs.ts                           ← Add filter
src/features/ecdcs/api/useEcdcsWithPractitioners.ts          ← Add filter
src/features/visits/api/useVisits.ts                         ← Add filter
src/features/visits/api/usePlannedVisits.ts                  ← Add filter
src/features/ecdcs/api/useLandmarks.ts                       ← Check if needed
```

**Pattern:**
```typescript
// BEFORE:
const { data, error } = await supabase
  .from('practitioners')
  .select('...')
  .order('name');

// AFTER:
const { data, error } = await supabase
  .from('practitioners')
  .select('...')
  .is('deleted_at', null)  // ← ADD THIS LINE
  .order('name');
```

### Phase 2: Create Delete Mutation Hooks ⏳ (HIGH PRIORITY)

**Files to Create:**
```
src/features/practitioners/api/useDeletePractitioner.ts      ← New file
src/features/ecdcs/api/useDeleteEcdc.ts                      ← New file
src/features/visits/api/useDeleteVisit.ts                    ← New file
```

**See:** [DELETE_OPERATIONS_FRONTEND.md](DELETE_OPERATIONS_FRONTEND.md) for complete code examples

### Phase 3: Create Admin Deleted Records View ⏳ (MEDIUM PRIORITY)

**Files to Create:**
```
src/features/layita/deleted/index.tsx                        ← New page
src/features/layita/deleted/api/useDeletedRecords.ts         ← New hooks
src/styles/deleted-records.css                               ← New styles
```

**Responsibilities:**
- Display three tabs: Practitioners, ECDCs, Visits
- Show soft-deleted records fetched via RPC functions
- Hard delete button with confirmation dialog
- Accessible only to administrators

### Phase 4: Add Delete Buttons to UI ⏳ (LOW PRIORITY)

- Add soft delete button to practitioner detail panel (admin only)
- Add soft delete button to ECDC detail panel (admin only)
- Add soft delete button to visit detail panel (admin only)
- All buttons should show confirmation dialog
- All buttons should be hidden for non-admins

### Phase 5: Add Route & Navigation ⏳ (LOW PRIORITY)

**Update:** `src/routes/Navitems.tsx`
```typescript
export const NAV_ITEMS = [
  // ... existing items ...
  { to: '/deleted', label: 'Deleted Records', icon: <TrashIcon />, role: 'admin' },
];
```

**Update:** `src/App.tsx`
```typescript
<Route element={<AdminRoute />}>
  {/* ... existing admin routes ... */}
  <Route path="/deleted" element={<DeletedRecordsPage />} />
</Route>
```

---

## Implementation Order (Recommended)

1. **Deploy Migration** (5 min)
   - Run: `supabase db push`
   - Verify columns and functions exist

2. **Update Fetch Hooks** (2–3 hours)
   - Add `.is('deleted_at', null)` to all queries
   - Test: Verify app still works
   - Verify: No soft-deleted records shown (they'll be empty initially)

3. **Create Mutation Hooks** (1–2 hours)
   - Create delete mutation files
   - Copy/paste from [DELETE_OPERATIONS_FRONTEND.md](DELETE_OPERATIONS_FRONTEND.md)
   - Test: Call hooks manually in console

4. **Create Admin Panel** (2–3 hours)
   - Create deleted records view
   - Wire up hard delete buttons
   - Add route and navigation

5. **Add Delete Buttons to Lists** (1–2 hours)
   - Update practitioner row/detail
   - Update ECDC row/detail
   - Update visit row/detail
   - Gate all buttons behind `isAdmin` check

6. **Testing** (2–3 hours)
   - Soft delete as admin → record hidden
   - Hard delete as admin → record gone permanently
   - Non-admin user → delete buttons hidden
   - Verify cascade behavior for practitioners → visits

---

## Key Design Decisions

| Decision | Reason |
|----------|--------|
| **Soft deletes don't cascade** | Preserves data integrity; only admin hard delete cascades |
| **Both soft & hard delete are admin-only** | Prevents accidental data loss by M&E staff |
| **RPC functions with authorization checks** | Security baked into database layer |
| **`.is('deleted_at', null)` on all queries** | Database enforces soft delete visibility via RLS |
| **Admin view for deleted records** | Allows review + recovery if needed |
| **Toast notifications** | Clear user feedback on delete success/error |

---

## Testing Matrix

| Test Case | Admin | Non-Admin | Expected |
|-----------|-------|-----------|----------|
| Soft delete practitioner | ✅ Works | ❌ Button hidden | Record hidden from lists |
| Hard delete practitioner | ✅ Works | ❌ Button hidden | Record permanently removed |
| View practitioner lists | ✅ No deleted | ✅ No deleted | All queries filter deleted_at |
| View deleted records | ✅ Can view | ❌ Cannot view | RPC function enforces role |
| Soft delete ECDC | ✅ Works | ❌ Button hidden | Practitioners still assigned |
| Hard delete ECDC | ✅ Works | ❌ Button hidden | Practitioners become unassigned |

---

## References

- **Backend Migration:** `supabase/migrations/20260603130000_add_soft_delete_functions.sql`
- **Frontend Examples:** [DELETE_OPERATIONS_FRONTEND.md](DELETE_OPERATIONS_FRONTEND.md)
- **Design Guide (Updated):** [LLM_DESIGN_GUIDE.md](LLM_DESIGN_GUIDE.md) — Section 2 (Deletion Policy)
- **Supabase RPC Docs:** https://supabase.com/docs/guides/database/functions

---

## Current Status

- ✅ Backend: Migration created, functions defined, RLS policies updated
- ⏳ Frontend: Ready to implement (no blockers)
- ⏳ Admin UI: Ready to build

**Next Step:** Deploy migration and update fetch hooks (Phase 1–2)
