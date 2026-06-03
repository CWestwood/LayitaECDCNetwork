# Layita Delete Function — Backend Implementation Outline

**Purpose:** Outline the database and Supabase backend requirements for implementing the two-tier deletion model (soft delete + hard delete) described in the LLM Design Guide.

**Current Date:** June 3, 2026  
**Status:** Planning Phase

---

## 1. Current Schema Analysis

### Tables Supporting Deletions (Per Design Guide)
The following tables are listed in the design guide as deletable:
- `practitioners`
- `ecdc_list`
- `outreach_visits`

### Missing Column: `deleted_at`
**Current Issue:** None of these tables currently have a `deleted_at` column.

**Schema Evidence:**
```sql
-- practitioners table (does NOT have deleted_at)
CREATE TABLE IF NOT EXISTS "public"."practitioners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text",
    "contact_number1" "text",
    "contact_number2" "text",
    "ecdc_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "group_id" "uuid",
    "dsd_funded" boolean,
    "dsd_registered" boolean,
    "has_whatsapp" boolean,
    "group" "text",
    "status" "text",
    -- ❌ NO deleted_at column
);

-- ecdc_list table (does NOT have deleted_at)
CREATE TABLE IF NOT EXISTS "public"."ecdc_list" (
    "id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text",
    "area" "text",
    "location" "public"."geography"(Point,4326),
    "longitude" double precision,
    "latitude" double precision,
    -- ❌ NO deleted_at column
);

-- outreach_visits table (does NOT have deleted_at)
CREATE TABLE IF NOT EXISTS "public"."outreach_visits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "date" "date",
    "practitioner_id" "uuid",
    -- ❌ NO deleted_at column
);
```

---

## 2. Implementation Steps (In Order)

### Step 1: Create Migration to Add `deleted_at` Columns

**File:** `supabase/migrations/[TIMESTAMP]_add_deleted_at_columns.sql`

**What to add:**
```sql
-- Add deleted_at to practitioners
ALTER TABLE "public"."practitioners" 
ADD COLUMN "deleted_at" timestamp with time zone DEFAULT NULL;

-- Add deleted_at to ecdc_list
ALTER TABLE "public"."ecdc_list" 
ADD COLUMN "deleted_at" timestamp with time zone DEFAULT NULL;

-- Add deleted_at to outreach_visits
ALTER TABLE "public"."outreach_visits" 
ADD COLUMN "deleted_at" timestamp with time zone DEFAULT NULL;

-- Optional but recommended: add indexes for fast filtering
CREATE INDEX practitioners_deleted_at_idx ON "public"."practitioners" ("deleted_at");
CREATE INDEX ecdc_list_deleted_at_idx ON "public"."ecdc_list" ("deleted_at");
CREATE INDEX outreach_visits_deleted_at_idx ON "public"."outreach_visits" ("deleted_at");
```

**Reasoning:**
- Indexes on `deleted_at` make queries with `.is('deleted_at', null)` efficient
- Null default means existing records are not deleted until explicitly marked

---

### Step 2: Update All SELECT Queries to Filter Out Soft-Deleted Records

**Affected Files in Frontend:**
All React Query hooks in `src/features/*/api/*.ts` that fetch practitioners, ecdcs, or outreach_visits.

**Example Current Query (BROKEN):**
```typescript
// src/features/practitioners/api/usePractitioners.ts
const fetchPractitioners = async (): Promise<Practitioner[]> => {
  const { data, error } = await supabase
    .from('practitioners')
    .select(`id, name, contact_number1, ...`)
    .order('name');
  // ❌ Problem: includes soft-deleted records
};
```

**Fixed Query:**
```typescript
const fetchPractitioners = async (): Promise<Practitioner[]> => {
  const { data, error } = await supabase
    .from('practitioners')
    .select(`id, name, contact_number1, ...`)
    .is('deleted_at', null)  // ← ADD THIS LINE
    .order('name');
};
```

**Hooks to Update:**
- ✅ `src/features/practitioners/api/usePractitioners.ts` — main list
- ✅ `src/features/practitioners/api/useUnmatchedQueue.ts` — unmatched practitioners
- ✅ `src/features/ecdcs/api/useEcdcsWithPractitioners.ts` — ECDC detail with practitioners
- ✅ `src/features/ecdcs/api/useEcdcs.ts` — ECDC list
- ✅ `src/features/visits/api/useVisits.ts` — visit list
- ✅ `src/features/visits/api/usePlannedVisits.ts` — planned visits
- Any other hook that queries these tables

---

### Step 3: Update RLS Policies to Respect Soft Deletion

**Current RLS Policies:** The schema defines read/write policies for each table, but none check `deleted_at`.

**Problem:** Even with `.is('deleted_at', null)` on the frontend, a clever user could bypass the frontend and fetch deleted records directly (since RLS doesn't enforce the filter).

**Solution:** Add `deleted_at` checks to RLS policies for practitioners, ecdc_list, and outreach_visits.

**Example Fix for practitioners:**
```sql
-- DROP old policy
DROP POLICY IF EXISTS "practitioners: authenticated read" ON "public"."practitioners";

-- CREATE new policy that filters deleted_at
CREATE POLICY "practitioners: authenticated read" ON "public"."practitioners" 
FOR SELECT TO "authenticated" 
USING (
  "deleted_at" IS NULL  -- ← Only show non-deleted records
);
```

**All policies to update:**
```
Table: practitioners
├── practitioners: authenticated read
└── practitioners: administrator write (keep write access to deleted records for audit)

Table: ecdc_list
├── ecdc_list: authenticated read
└── ecdc_list: administrator write

Table: outreach_visits
├── outreach_visits: authenticated read
├── outreach_visits: datacapturer insert
├── outreach_visits: datacapturer update own
└── outreach_visits: manager update
```

**Updated RLS Policy Examples:**
```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- practitioners
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "practitioners: authenticated read" ON "public"."practitioners";

CREATE POLICY "practitioners: authenticated read" ON "public"."practitioners"
FOR SELECT TO "authenticated"
USING ("deleted_at" IS NULL);

-- Write policies remain unchanged — administrators still need to UPDATE
-- deleted_at on these rows, and the DB functions run as SECURITY DEFINER
-- so they bypass RLS anyway. No write policy changes are needed.

-- ─────────────────────────────────────────────────────────────────────────────
-- ecdc_list
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "ecdc_list: authenticated read" ON "public"."ecdc_list";

CREATE POLICY "ecdc_list: authenticated read" ON "public"."ecdc_list"
FOR SELECT TO "authenticated"
USING ("deleted_at" IS NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- outreach_visits
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "outreach_visits: authenticated read" ON "public"."outreach_visits";

CREATE POLICY "outreach_visits: authenticated read" ON "public"."outreach_visits"
FOR SELECT TO "authenticated"
USING ("deleted_at" IS NULL);

-- outreach_visits: datacapturer insert (only into non-deleted practitioners)
CREATE POLICY "outreach_visits: datacapturer insert" ON "public"."outreach_visits" 
FOR INSERT TO "authenticated" 
WITH CHECK (
  ("public"."get_my_role"() = 'datacapturer'::"text") 
  AND ("data_capturer_id" = ( 
    SELECT "ls"."id" FROM ("public"."layita_staff" "ls"
    JOIN "public"."profiles" "p" ON ("lower"("p"."name") = "lower"("ls"."name")))
    WHERE "p"."id" = "auth"."uid"())
);
```

---

### Step 4: Create Backend Mutation Functions

**Why:** Supabase does not have built-in soft delete. We need to provide structured mutation endpoints.

**Option A: Direct Update via RLS (Simple)**
Frontend directly calls:
```typescript
const { error } = await supabase
  .from('practitioners')
  .update({ deleted_at: new Date().toISOString() })
  .eq('id', id);
```

**Pros:**
- No backend code needed
- Works with existing RLS (admin can update any record)

**Cons:**
- No validation
- No transaction handling
- No audit trail separation for deletes vs. edits

---

**Option B: PostgreSQL Function (Recommended)**
Create a function that handles soft/hard delete with proper validation and audit.

**File:** `supabase/migrations/[TIMESTAMP]_delete_functions.sql`

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- SOFT DELETE FUNCTIONS
-- Sets deleted_at timestamp. Each function checks role before acting.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- soft_delete_practitioner
-- Allowed: manager, administrator
-- Cascade: also soft-deletes all active outreach_visits for this practitioner
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."soft_delete_practitioner"(
  "p_id" "uuid"
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_count int;
  v_deleted_at timestamptz;
BEGIN
  -- Authorization
  v_role := get_my_role();
  IF v_role NOT IN ('manager', 'administrator') THEN
    RETURN jsonb_build_object(
      'error', 'Only managers and administrators can delete practitioners'
    );
  END IF;

  -- Confirm record exists and is not already deleted
  SELECT COUNT(*) INTO v_count
  FROM practitioners
  WHERE id = p_id AND deleted_at IS NULL;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('error', 'Practitioner not found or already deleted');
  END IF;

  v_deleted_at := now();

  -- Cascade soft-delete to this practitioner's active visits.
  -- Visits belong to the practitioner record; if the practitioner is removed,
  -- their visits should not remain visible in the visits list as orphaned rows.
  UPDATE outreach_visits
  SET deleted_at = v_deleted_at
  WHERE practitioner_id = p_id
    AND deleted_at IS NULL;

  -- Soft-delete the practitioner
  UPDATE practitioners
  SET deleted_at = v_deleted_at
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Practitioner and associated visits marked for deletion',
    'deleted_at', v_deleted_at
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- soft_delete_ecdc
-- Allowed: administrator only
-- ECDCs are core infrastructure. Practitioner.ecdc_id FK is ON DELETE SET NULL,
-- so soft-deleting an ECDC does not cascade to practitioners — they become
-- unassigned (ecdc_id = NULL) only on hard delete, not soft delete.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."soft_delete_ecdc"(
  "e_id" "uuid"
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_count int;
  v_deleted_at timestamptz;
  v_linked_practitioners int;
BEGIN
  -- Authorization: administrator only
  v_role := get_my_role();
  IF v_role != 'administrator' THEN
    RETURN jsonb_build_object(
      'error', 'Only administrators can delete ECDCs'
    );
  END IF;

  -- Confirm record exists and is not already deleted
  SELECT COUNT(*) INTO v_count
  FROM ecdc_list
  WHERE id = e_id AND deleted_at IS NULL;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('error', 'ECDC not found or already deleted');
  END IF;

  -- Warn if practitioners are still assigned (do not block, just inform)
  SELECT COUNT(*) INTO v_linked_practitioners
  FROM practitioners
  WHERE ecdc_id = e_id AND deleted_at IS NULL;

  v_deleted_at := now();

  UPDATE ecdc_list
  SET deleted_at = v_deleted_at
  WHERE id = e_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'ECDC marked for deletion',
    'deleted_at', v_deleted_at,
    'warning', CASE
      WHEN v_linked_practitioners > 0
      THEN v_linked_practitioners || ' practitioner(s) still assigned to this ECDC'
      ELSE NULL
    END
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- soft_delete_visit
-- Allowed: datacapturer (own visits only), manager, administrator (any visit)
-- No cascade needed: visits are leaf records with no dependents.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."soft_delete_visit"(
  "v_id" "uuid"
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_count int;
  v_owner_id uuid;
  v_staff_id uuid;
  v_deleted_at timestamptz;
BEGIN
  v_role := get_my_role();

  -- Confirm record exists and is not already deleted
  SELECT COUNT(*), data_capturer_id
  INTO v_count, v_owner_id
  FROM outreach_visits
  WHERE id = v_id AND deleted_at IS NULL
  GROUP BY data_capturer_id;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('error', 'Visit not found or already deleted');
  END IF;

  -- Datakapturers may only delete their own visits
  IF v_role = 'datacapturer' THEN
    SELECT ls.id INTO v_staff_id
    FROM layita_staff ls
    JOIN profiles p ON lower(p.name) = lower(ls.name)
    WHERE p.id = auth.uid();

    IF v_owner_id IS DISTINCT FROM v_staff_id THEN
      RETURN jsonb_build_object(
        'error', 'Datakapturers can only delete their own visits'
      );
    END IF;

  ELSIF v_role NOT IN ('manager', 'administrator') THEN
    RETURN jsonb_build_object(
      'error', 'Insufficient permissions to delete visits'
    );
  END IF;

  v_deleted_at := now();

  UPDATE outreach_visits
  SET deleted_at = v_deleted_at
  WHERE id = v_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Visit marked for deletion',
    'deleted_at', v_deleted_at
  );
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- HARD DELETE FUNCTIONS
-- Permanent removal — administrator only.
-- Each function requires the record to already be soft-deleted first.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- hard_delete_practitioner
-- Requires: record already soft-deleted
-- Cascade: hard-deletes all outreach_visits for this practitioner first,
--          then deletes the practitioner. This satisfies the FK constraint
--          (outreach_visits.practitioner_id ON DELETE RESTRICT).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."hard_delete_practitioner"(
  "p_id" "uuid"
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_count int;
  v_deleted_name text;
BEGIN
  -- Administrator only
  v_role := get_my_role();
  IF v_role != 'administrator' THEN
    RETURN jsonb_build_object(
      'error', 'Only administrators can permanently delete records'
    );
  END IF;

  -- Record must exist and must already be soft-deleted
  SELECT COUNT(*), name INTO v_count, v_deleted_name
  FROM practitioners
  WHERE id = p_id AND deleted_at IS NOT NULL
  GROUP BY name;

  IF v_count = 0 THEN
    RETURN jsonb_build_object(
      'error', 'Practitioner not found or has not been soft-deleted first'
    );
  END IF;

  -- Write audit record before deletion (record will no longer exist after)
  INSERT INTO audit_logs (table_name, record_id, changed_fields, changed_by_name)
  VALUES (
    'practitioners',
    p_id,
    jsonb_build_object('action', 'hard_delete', 'name', v_deleted_name),
    (SELECT name FROM profiles WHERE id = auth.uid())
  );

  -- Hard-delete all associated visits first (satisfies FK constraint)
  DELETE FROM outreach_visits WHERE practitioner_id = p_id;

  -- Hard-delete the practitioner
  DELETE FROM practitioners WHERE id = p_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Practitioner permanently deleted'
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- hard_delete_ecdc
-- Requires: record already soft-deleted
-- Note: practitioners.ecdc_id FK is ON DELETE SET NULL, so linked practitioners
--       become unassigned (ecdc_id = NULL) when the ECDC row is deleted.
--       This is intentional — the practitioners themselves are not deleted.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."hard_delete_ecdc"(
  "e_id" "uuid"
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_count int;
  v_deleted_name text;
BEGIN
  -- Administrator only
  v_role := get_my_role();
  IF v_role != 'administrator' THEN
    RETURN jsonb_build_object(
      'error', 'Only administrators can permanently delete records'
    );
  END IF;

  -- Record must exist and must already be soft-deleted
  SELECT COUNT(*), name INTO v_count, v_deleted_name
  FROM ecdc_list
  WHERE id = e_id AND deleted_at IS NOT NULL
  GROUP BY name;

  IF v_count = 0 THEN
    RETURN jsonb_build_object(
      'error', 'ECDC not found or has not been soft-deleted first'
    );
  END IF;

  -- Write audit record before deletion
  INSERT INTO audit_logs (table_name, record_id, changed_fields, changed_by_name)
  VALUES (
    'ecdc_list',
    e_id,
    jsonb_build_object('action', 'hard_delete', 'name', v_deleted_name),
    (SELECT name FROM profiles WHERE id = auth.uid())
  );

  -- Hard-delete the ECDC.
  -- Linked practitioners will have ecdc_id set to NULL by the FK ON DELETE SET NULL.
  DELETE FROM ecdc_list WHERE id = e_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'ECDC permanently deleted. Linked practitioners are now unassigned.'
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- hard_delete_visit
-- Requires: record already soft-deleted
-- No cascade needed: visits are leaf records.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."hard_delete_visit"(
  "v_id" "uuid"
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_count int;
BEGIN
  -- Administrator only
  v_role := get_my_role();
  IF v_role != 'administrator' THEN
    RETURN jsonb_build_object(
      'error', 'Only administrators can permanently delete records'
    );
  END IF;

  -- Record must exist and must already be soft-deleted
  SELECT COUNT(*) INTO v_count
  FROM outreach_visits
  WHERE id = v_id AND deleted_at IS NOT NULL;

  IF v_count = 0 THEN
    RETURN jsonb_build_object(
      'error', 'Visit not found or has not been soft-deleted first'
    );
  END IF;

  -- Write audit record before deletion
  INSERT INTO audit_logs (table_name, record_id, changed_fields, changed_by_name)
  VALUES (
    'outreach_visits',
    v_id,
    jsonb_build_object('action', 'hard_delete'),
    (SELECT name FROM profiles WHERE id = auth.uid())
  );

  DELETE FROM outreach_visits WHERE id = v_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Visit permanently deleted'
  );
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- ADMIN READ FUNCTIONS
-- Used by the admin deleted-records view. Bypasses the deleted_at IS NULL
-- RLS policy in a controlled way — role is checked inside the function.
-- The frontend uses .rpc() to call these instead of direct table queries.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION "public"."get_deleted_practitioners"()
RETURNS SETOF practitioners
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
BEGIN
  IF get_my_role() != 'administrator' THEN
    RAISE EXCEPTION 'Only administrators can view deleted records';
  END IF;

  RETURN QUERY
  SELECT * FROM practitioners
  WHERE deleted_at IS NOT NULL
  ORDER BY deleted_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_deleted_ecdcs"()
RETURNS SETOF ecdc_list
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
BEGIN
  IF get_my_role() != 'administrator' THEN
    RAISE EXCEPTION 'Only administrators can view deleted records';
  END IF;

  RETURN QUERY
  SELECT * FROM ecdc_list
  WHERE deleted_at IS NOT NULL
  ORDER BY deleted_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_deleted_visits"()
RETURNS SETOF outreach_visits
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
BEGIN
  IF get_my_role() != 'administrator' THEN
    RAISE EXCEPTION 'Only administrators can view deleted records';
  END IF;

  RETURN QUERY
  SELECT * FROM outreach_visits
  WHERE deleted_at IS NOT NULL
  ORDER BY deleted_at DESC;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- RESTORE FUNCTIONS
-- Clears deleted_at — administrator only.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION "public"."restore_practitioner"("p_id" "uuid")
RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER AS $$
BEGIN
  IF get_my_role() != 'administrator' THEN
    RETURN jsonb_build_object('error', 'Only administrators can restore records');
  END IF;

  -- Restore the practitioner
  UPDATE practitioners SET deleted_at = NULL WHERE id = p_id AND deleted_at IS NOT NULL;

  -- Also restore any visits that were cascade-deleted with this practitioner
  UPDATE outreach_visits SET deleted_at = NULL
  WHERE practitioner_id = p_id AND deleted_at IS NOT NULL;

  RETURN jsonb_build_object('success', true, 'message', 'Practitioner and visits restored');
END;
$$;

CREATE OR REPLACE FUNCTION "public"."restore_ecdc"("e_id" "uuid")
RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER AS $$
BEGIN
  IF get_my_role() != 'administrator' THEN
    RETURN jsonb_build_object('error', 'Only administrators can restore records');
  END IF;

  UPDATE ecdc_list SET deleted_at = NULL WHERE id = e_id AND deleted_at IS NOT NULL;

  RETURN jsonb_build_object('success', true, 'message', 'ECDC restored');
END;
$$;

CREATE OR REPLACE FUNCTION "public"."restore_visit"("v_id" "uuid")
RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER AS $$
BEGIN
  IF get_my_role() != 'administrator' THEN
    RETURN jsonb_build_object('error', 'Only administrators can restore records');
  END IF;

  UPDATE outreach_visits SET deleted_at = NULL WHERE id = v_id AND deleted_at IS NOT NULL;

  RETURN jsonb_build_object('success', true, 'message', 'Visit restored');
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- GRANT PERMISSIONS
-- All functions must be explicitly granted to the authenticated role.
-- Without these, .rpc() calls will fail with a permissions error.
-- ═══════════════════════════════════════════════════════════════════════════

-- Soft deletes
GRANT EXECUTE ON FUNCTION public.soft_delete_practitioner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_ecdc(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_visit(uuid) TO authenticated;

-- Hard deletes
GRANT EXECUTE ON FUNCTION public.hard_delete_practitioner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hard_delete_ecdc(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hard_delete_visit(uuid) TO authenticated;

-- Admin reads
GRANT EXECUTE ON FUNCTION public.get_deleted_practitioners() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_deleted_ecdcs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_deleted_visits() TO authenticated;

-- Restores
GRANT EXECUTE ON FUNCTION public.restore_practitioner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_ecdc(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_visit(uuid) TO authenticated;
```

**Advantages of using functions:**
- ✅ Authorization logic centralized in database
- ✅ Audit trail with hard delete attempts
- ✅ Atomic transactions
- ✅ Validation before delete (e.g., check dependencies)

---

### Step 5: Update Frontend Mutations to Use New Functions

**File:** `src/features/practitioners/api/useDeletePractitioner.ts` (New)

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../auth/supabaseClient';
import { toast } from 'sonner';

export function useDeletePractitioner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('soft_delete_practitioner', { p_id: id });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      queryClient.invalidateQueries({ queryKey: ['visits'] }); // cascade affects visits
      toast.warning('Practitioner removed. An administrator can restore this record.');
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
      const { data, error } = await supabase.rpc('hard_delete_practitioner', { p_id: id });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      queryClient.invalidateQueries({ queryKey: ['practitioners', 'deleted'] });
      toast.success('Practitioner permanently deleted');
    },
    onError: (error) => {
      toast.error(`Permanent delete failed: ${error.message}`);
    },
  });
}

export function useRestorePractitioner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('restore_practitioner', { p_id: id });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      queryClient.invalidateQueries({ queryKey: ['practitioners', 'deleted'] });
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      toast.success('Practitioner restored');
    },
    onError: (error) => {
      toast.error(`Restore failed: ${error.message}`);
    },
  });
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../auth/supabaseClient';
import { toast } from 'sonner';

export function useDeleteEcdc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('soft_delete_ecdc', { e_id: id });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      // Surface the warning about linked practitioners if present
      if (data?.warning) toast.info(data.warning);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ecdcs'] });
      toast.warning('ECDC removed. An administrator can restore this record.');
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
      const { data, error } = await supabase.rpc('hard_delete_ecdc', { e_id: id });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ecdcs'] });
      queryClient.invalidateQueries({ queryKey: ['ecdcs', 'deleted'] });
      queryClient.invalidateQueries({ queryKey: ['practitioners'] }); // ecdc_id → NULL
      toast.success('ECDC permanently deleted');
    },
    onError: (error) => {
      toast.error(`Permanent delete failed: ${error.message}`);
    },
  });
}

export function useRestoreEcdc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('restore_ecdc', { e_id: id });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ecdcs'] });
      queryClient.invalidateQueries({ queryKey: ['ecdcs', 'deleted'] });
      toast.success('ECDC restored');
    },
    onError: (error) => {
      toast.error(`Restore failed: ${error.message}`);
    },
  });
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../auth/supabaseClient';
import { toast } from 'sonner';

export function useDeleteVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('soft_delete_visit', { v_id: id });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      toast.warning('Visit removed. An administrator can restore this record.');
    },
    onError: (error) => {
      toast.error(`Delete failed: ${error.message}`);
    },
  });
}

export function useHardDeleteVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('hard_delete_visit', { v_id: id });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      queryClient.invalidateQueries({ queryKey: ['visits', 'deleted'] });
      toast.success('Visit permanently deleted');
    },
    onError: (error) => {
      toast.error(`Permanent delete failed: ${error.message}`);
    },
  });
}

export function useRestoreVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('restore_visit', { v_id: id });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      queryClient.invalidateQueries({ queryKey: ['visits', 'deleted'] });
      toast.success('Visit restored');
    },
    onError: (error) => {
      toast.error(`Restore failed: ${error.message}`);
    },
  });
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../auth/supabaseClient';

export function useDeletedPractitioners() {
  return useQuery({
    queryKey: ['practitioners', 'deleted'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_deleted_practitioners');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useDeletedEcdcs() {
  return useQuery({
    queryKey: ['ecdcs', 'deleted'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_deleted_ecdcs');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useDeletedVisits() {
  return useQuery({
    queryKey: ['visits', 'deleted'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_deleted_visits');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}
```

---

### Step 6: Create Admin View for Soft-Deleted Records

**Why:** Administrators need to review and restore (or permanently delete) soft-deleted records.

**UI Location:** Audit page or new "Deleted Records" admin section

**Component:** `src/features/layita/deleted/index.tsx` (New)

```typescript
import { useState } from 'react';
import {
  useDeletedPractitioners,
  useDeletedEcdcs,
  useDeletedVisits,
} from './api/useDeletedRecords';
import {
  useHardDeletePractitioner,
  useRestorePractitioner,
} from '../../practitioners/api/useDeletePractitioner';
import {
  useHardDeleteEcdc,
  useRestoreEcdc,
} from '../../ecdcs/api/useDeleteEcdc';
import {
  useHardDeleteVisit,
  useRestoreVisit,
} from '../../visits/api/useDeleteVisit';

type Tab = 'practitioners' | 'ecdcs' | 'visits';

export default function DeletedRecords() {
  const [activeTab, setActiveTab] = useState<Tab>('practitioners');

  return (
    <div className="la-deleted">
      <header className="la-deleted__header">
        <h1 className="la-deleted__title">Deleted Records</h1>
        <p className="la-deleted__subtitle">
          Records removed by users. Restore or permanently delete from here.
        </p>
      </header>

      <div className="la-deleted__tabs">
        {(['practitioners', 'ecdcs', 'visits'] as Tab[]).map(tab => (
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


// ─────────────────────────────────────────────────────────────────────────────
// Shared confirm-action row pattern
// Replaces window.confirm() with inline two-step confirmation.
// ─────────────────────────────────────────────────────────────────────────────

interface ConfirmActionsProps {
  id: string;
  confirmingId: string | null;
  setConfirmingId: (id: string | null) => void;
  onHardDelete: (id: string) => void;
  onRestore: (id: string) => void;
  isPending: boolean;
}

function ConfirmActions({
  id,
  confirmingId,
  setConfirmingId,
  onHardDelete,
  onRestore,
  isPending,
}: ConfirmActionsProps) {
  if (confirmingId === id) {
    return (
      <div className="la-deleted__confirm">
        <span className="la-deleted__confirm-label">Permanently delete?</span>
        <button
          className="la-deleted__btn la-deleted__btn--danger"
          disabled={isPending}
          onClick={() => { onHardDelete(id); setConfirmingId(null); }}
        >
          {isPending ? 'Deleting…' : 'Yes, delete permanently'}
        </button>
        <button
          className="la-deleted__btn"
          onClick={() => setConfirmingId(null)}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="la-deleted__actions">
      <button
        className="la-deleted__btn"
        onClick={() => onRestore(id)}
      >
        Restore
      </button>
      <button
        className="la-deleted__btn la-deleted__btn--danger"
        onClick={() => setConfirmingId(id)}
      >
        Delete permanently
      </button>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Practitioners
// ─────────────────────────────────────────────────────────────────────────────

function DeletedPractitionersList() {
  const { data = [], isLoading } = useDeletedPractitioners();
  const { mutate: hardDelete, isPending: hardPending } = useHardDeletePractitioner();
  const { mutate: restore } = useRestorePractitioner();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (isLoading) return <div className="la-deleted__loading">Loading…</div>;
  if (data.length === 0) return <div className="la-deleted__empty">No deleted practitioners</div>;

  return (
    <table className="la-deleted__table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Deleted</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {data.map(p => (
          <tr key={p.id} className="la-deleted__row">
            <td>{p.name ?? '—'}</td>
            <td>{new Date(p.deleted_at).toLocaleDateString()}</td>
            <td>
              <ConfirmActions
                id={p.id}
                confirmingId={confirmingId}
                setConfirmingId={setConfirmingId}
                onHardDelete={hardDelete}
                onRestore={restore}
                isPending={hardPending}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// ECDCs
// ─────────────────────────────────────────────────────────────────────────────

function DeletedEcdcsList() {
  const { data = [], isLoading } = useDeletedEcdcs();
  const { mutate: hardDelete, isPending: hardPending } = useHardDeleteEcdc();
  const { mutate: restore } = useRestoreEcdc();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (isLoading) return <div className="la-deleted__loading">Loading…</div>;
  if (data.length === 0) return <div className="la-deleted__empty">No deleted ECDCs</div>;

  return (
    <table className="la-deleted__table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Area</th>
          <th>Deleted</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {data.map(e => (
          <tr key={e.id} className="la-deleted__row">
            <td>{e.name ?? '—'}</td>
            <td>{e.area ?? '—'}</td>
            <td>{new Date(e.deleted_at).toLocaleDateString()}</td>
            <td>
              <ConfirmActions
                id={e.id}
                confirmingId={confirmingId}
                setConfirmingId={setConfirmingId}
                onHardDelete={hardDelete}
                onRestore={restore}
                isPending={hardPending}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Visits
// ─────────────────────────────────────────────────────────────────────────────

function DeletedVisitsList() {
  const { data = [], isLoading } = useDeletedVisits();
  const { mutate: hardDelete, isPending: hardPending } = useHardDeleteVisit();
  const { mutate: restore } = useRestoreVisit();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (isLoading) return <div className="la-deleted__loading">Loading…</div>;
  if (data.length === 0) return <div className="la-deleted__empty">No deleted visits</div>;

  return (
    <table className="la-deleted__table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Type</th>
          <th>Deleted</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {data.map(v => (
          <tr key={v.id} className="la-deleted__row">
            <td>{v.date ?? '—'}</td>
            <td>{v.outreach_type ?? '—'}</td>
            <td>{new Date(v.deleted_at).toLocaleDateString()}</td>
            <td>
              <ConfirmActions
                id={v.id}
                confirmingId={confirmingId}
                setConfirmingId={setConfirmingId}
                onHardDelete={hardDelete}
                onRestore={restore}
                isPending={hardPending}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

---

## 3. Dependency & Foreign Key Considerations

### Current Foreign Key Constraints

**practitioners table:**
- `practitioners.ecdc_id` → `ecdc_list.id` (ON DELETE SET NULL)
- `practitioners.group_id` → `groups.id` (ON DELETE RESTRICT)

**outreach_visits table:**
- `outreach_visits.practitioner_id` → `practitioners.id` (ON DELETE RESTRICT)
- `outreach_visits.data_capturer_id` → `layita_staff.id` (ON DELETE RESTRICT)

### Soft Delete Implications

**Problem:** If we soft-delete a practitioner with existing outreach_visits, the FK constraint `ON DELETE RESTRICT` will block a hard delete attempt.

**Solution 1: Cascade delete on hard delete**
Before hard-deleting a practitioner, first hard-delete all related outreach_visits.

```sql
CREATE OR REPLACE FUNCTION "public"."hard_delete_practitioner"(
  "p_id" "uuid"
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
BEGIN
  -- First, delete all related outreach_visits (soft delete them)
  UPDATE outreach_visits 
  SET deleted_at = now() 
  WHERE practitioner_id = p_id AND deleted_at IS NULL;

  -- Then hard delete the visits
  DELETE FROM outreach_visits WHERE practitioner_id = p_id;

  -- Finally hard delete the practitioner
  DELETE FROM practitioners WHERE id = p_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
```

**Solution 2: Prevent hard delete if dependencies exist**
```sql
CREATE OR REPLACE FUNCTION "public"."hard_delete_practitioner"(
  "p_id" "uuid"
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
BEGIN
  -- Check for non-deleted visits
  IF EXISTS (SELECT 1 FROM outreach_visits 
             WHERE practitioner_id = p_id AND deleted_at IS NULL) THEN
    RETURN jsonb_build_object(
      'error', 
      'Cannot delete practitioner with non-deleted outreach visits'
    );
  END IF;

  DELETE FROM practitioners WHERE id = p_id;
  RETURN jsonb_build_object('success', true);
END;
$$;
```

**Recommendation:** Use Solution 1 (cascade soft-delete) for a seamless UX.

---

## 4. Restore Functionality (Optional Enhancement)

If administrators need to un-delete records:

```sql
CREATE OR REPLACE FUNCTION "public"."restore_practitioner"(
  "p_id" "uuid"
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
BEGIN
  IF get_my_role() != 'administrator' THEN
    RETURN jsonb_build_object('error', 'Only administrators can restore records');
  END IF;

  UPDATE practitioners SET deleted_at = NULL WHERE id = p_id;

  RETURN jsonb_build_object('success', true, 'message', 'Practitioner restored');
END;
$$;
```

---

## 5. Implementation Checklist

### Phase 1: Database Schema (Required)
- [ ] Create migration: add `deleted_at` columns to practitioners, ecdc_list, outreach_visits
- [ ] Add indexes on `deleted_at` columns
- [ ] Run migration: `supabase db push`

### Phase 2: RLS Policies (Required)
- [ ] Update all SELECT policies to filter `deleted_at IS NULL`
- [ ] Keep WRITE policies open to deleted_at field for hard deletes
- [ ] Test: verify soft-deleted records are invisible to frontend

### Phase 3: Database Functions (Required)
- [ ] Create soft delete functions for practitioners, ecdcs, visits
- [ ] Create hard delete functions (admin only) with dependency handling
- [ ] Add GRANT permissions for frontend to call functions

### Phase 4: Frontend Hooks (Required)
- [ ] Add `.is('deleted_at', null)` to all data fetch hooks
- [ ] Create `useDeletePractitioner()` hook
- [ ] Create `useDeleteEcdc()` hook
- [ ] Create `useDeleteVisit()` hook
- [ ] Create admin hard-delete hooks

### Phase 5: Admin UI (Required)
- [ ] Create deleted records listing page
- [ ] Add hard-delete buttons with confirmation dialog
- [ ] (Optional) Add restore functionality

### Phase 6: Testing (Required)
- [ ] Soft delete practitioner → verify hidden from list
- [ ] Hard delete (admin) → verify record gone permanently
- [ ] Test foreign key cascades (visits deleted with practitioner)
- [ ] Test RLS: unauthenticated user cannot see deleted records

---

## 6. Backward Compatibility Notes

**When implemented, all existing records will have `deleted_at = NULL`** (meaning "not deleted"), so:
- ✅ All existing queries will still return existing records
- ✅ No data loss occurs
- ✅ All current users see their normal data

---

## 7. Timeline Estimate

| Phase | Effort | Time |
|-------|--------|------|
| Phase 1 (Schema) | Low | 15 min |
| Phase 2 (RLS) | Low | 30 min |
| Phase 3 (Functions) | Medium | 1–2 hours |
| Phase 4 (Frontend) | Medium | 2–3 hours |
| Phase 5 (Admin UI) | Low–Medium | 1–2 hours |
| Phase 6 (Testing) | Medium | 1–2 hours |
| **Total** | | **6–10 hours** |

---

## 8. Next Steps

1. **Review this outline** with the team
2. **Create Phase 1 migration** and test locally: `supabase db push`
3. **Implement Phase 2–3** (RLS + functions)
4. **Update all frontend hooks** (Phase 4)
5. **Build admin UI** (Phase 5)
6. **Test thoroughly** (Phase 6)

---

## References

- Design Guide: [LLM_DESIGN_GUIDE.md#deletion-policy](LLM_DESIGN_GUIDE.md)
- Supabase RLS Docs: https://supabase.com/docs/guides/auth/row-level-security
- Supabase Stored Procedures: https://supabase.com/docs/guides/database/functions
- PostgreSQL Triggers: https://www.postgresql.org/docs/current/sql-createtrigger.html
