-- ═══════════════════════════════════════════════════════════════════════════
-- Add Soft Delete Functionality to Layita
-- 
-- This migration adds:
-- 1. deleted_at columns to practitioners, ecdc_list, outreach_visits
-- 2. Indexes on deleted_at for query performance
-- 3. PostgreSQL functions for soft and hard delete operations (admin only)
-- 4. Updated RLS policies to filter out soft-deleted records
--
-- Soft Delete: Sets deleted_at timestamp (no cascade effects)
-- Hard Delete: Permanent removal from database (admin only, cascade handled for FK constraints)
-- ═══════════════════════════════════════════════════════════════════════════

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1: Add deleted_at columns
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."practitioners" 
ADD COLUMN "deleted_at" timestamp with time zone DEFAULT NULL;

ALTER TABLE "public"."ecdc_list" 
ADD COLUMN "deleted_at" timestamp with time zone DEFAULT NULL;

ALTER TABLE "public"."outreach_visits" 
ADD COLUMN "deleted_at" timestamp with time zone DEFAULT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2: Create indexes for performance
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX "practitioners_deleted_at_idx" ON "public"."practitioners" ("deleted_at");
CREATE INDEX "ecdc_list_deleted_at_idx" ON "public"."ecdc_list" ("deleted_at");
CREATE INDEX "outreach_visits_deleted_at_idx" ON "public"."outreach_visits" ("deleted_at");

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3: Soft Delete Functions (No Cascade)
-- 
-- These functions mark records as deleted by setting deleted_at timestamp.
-- Admin only. No cascading deletions — only the specified record is marked deleted.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION "public"."soft_delete_practitioner"(
  "p_id" "uuid"
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_count int;
  v_name text;
  v_deleted_at timestamptz;
BEGIN
  -- Authorization: admin only
  v_role := public.get_my_role();
  IF v_role != 'administrator' THEN
    RETURN jsonb_build_object(
      'error', 'Only administrators can delete practitioners',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  -- Check record exists and is not already deleted
  SELECT COUNT(*), name INTO v_count, v_name 
  FROM practitioners 
  WHERE id = p_id AND deleted_at IS NULL;
  
  IF v_count = 0 THEN
    RETURN jsonb_build_object(
      'error', 'Practitioner not found or already deleted',
      'code', 'NOT_FOUND'
    );
  END IF;

  -- Perform soft delete (no cascade)
  v_deleted_at := now();
  UPDATE practitioners SET deleted_at = v_deleted_at WHERE id = p_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Practitioner marked for deletion',
    'name', v_name,
    'deleted_at', v_deleted_at
  );
END;
$$;

ALTER FUNCTION "public"."soft_delete_practitioner"("uuid") OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."soft_delete_practitioner"("uuid") TO "authenticated";

-- Allow duplicate names for soft-deleted practitioners (unique constraint only applies to non-deleted records)
DROP INDEX IF EXISTS "public"."practitioner_unique";
CREATE UNIQUE INDEX "practitioner_unique" ON "public"."practitioners" 
USING "btree" ("lower"("name"), "ecdc_id") 
WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."soft_delete_ecdc"(
  "e_id" "uuid"
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_count int;
  v_name text;
  v_deleted_at timestamptz;
  v_linked_practitioners int;
BEGIN
  -- Authorization: admin only
  v_role := public.get_my_role();
  IF v_role != 'administrator' THEN
    RETURN jsonb_build_object(
      'error', 'Only administrators can delete ECDCs',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  -- Check record exists and is not already deleted
  SELECT COUNT(*), name INTO v_count, v_name 
  FROM ecdc_list 
  WHERE id = e_id AND deleted_at IS NULL;
  
  IF v_count = 0 THEN
    RETURN jsonb_build_object(
      'error', 'ECDC not found or already deleted',
      'code', 'NOT_FOUND'
    );
  END IF;

  -- Count linked practitioners (info only, soft delete doesn't cascade)
  SELECT COUNT(*) INTO v_linked_practitioners 
  FROM practitioners 
  WHERE ecdc_id = e_id AND deleted_at IS NULL;

  -- Perform soft delete (no cascade — practitioners remain assigned)
  v_deleted_at := now();
  UPDATE ecdc_list SET deleted_at = v_deleted_at WHERE id = e_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'ECDC marked for deletion',
    'name', v_name,
    'linked_practitioners', v_linked_practitioners,
    'note', 'Practitioners remain assigned; they will become unassigned on hard delete',
    'deleted_at', v_deleted_at
  );
END;
$$;

ALTER FUNCTION "public"."soft_delete_ecdc"("uuid") OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."soft_delete_ecdc"("uuid") TO "authenticated";

-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."soft_delete_outreach_visit"(
  "v_id" "uuid"
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_count int;
  v_date date;
  v_deleted_at timestamptz;
BEGIN
  -- Authorization: admin only
  v_role := public.get_my_role();
  IF v_role != 'administrator' THEN
    RETURN jsonb_build_object(
      'error', 'Only administrators can delete visits',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  -- Check record exists and is not already deleted
  SELECT COUNT(*), date INTO v_count, v_date 
  FROM outreach_visits 
  WHERE id = v_id AND deleted_at IS NULL;
  
  IF v_count = 0 THEN
    RETURN jsonb_build_object(
      'error', 'Outreach visit not found or already deleted',
      'code', 'NOT_FOUND'
    );
  END IF;

  -- Perform soft delete
  v_deleted_at := now();
  UPDATE outreach_visits SET deleted_at = v_deleted_at WHERE id = v_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Outreach visit marked for deletion',
    'date', v_date,
    'deleted_at', v_deleted_at
  );
END;
$$;

ALTER FUNCTION "public"."soft_delete_outreach_visit"("uuid") OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."soft_delete_outreach_visit"("uuid") TO "authenticated";

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 4: Hard Delete Functions (Permanent Removal)
-- 
-- These functions permanently remove records from the database.
-- Admin only. Hard delete of practitioners will hard delete their visits first
-- to satisfy the FK constraint (outreach_visits.practitioner_id ON DELETE RESTRICT).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION "public"."hard_delete_practitioner"(
  "p_id" "uuid"
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_count int;
  v_deleted_name text;
  v_visit_count int;
BEGIN
  -- Authorization: admin only
  v_role := public.get_my_role();
  IF v_role != 'administrator' THEN
    RETURN jsonb_build_object(
      'error', 'Only administrators can permanently delete records',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  -- Check record exists and is soft-deleted
  SELECT COUNT(*), name INTO v_count, v_deleted_name 
  FROM practitioners 
  WHERE id = p_id AND deleted_at IS NOT NULL;
  
  IF v_count = 0 THEN
    RETURN jsonb_build_object(
      'error', 'Practitioner not found or not soft-deleted',
      'code', 'NOT_FOUND'
    );
  END IF;

  -- Count visits to delete
  SELECT COUNT(*) INTO v_visit_count 
  FROM outreach_visits 
  WHERE practitioner_id = p_id;

  -- Add audit log entry for practitioner deletion  
  INSERT INTO public.audit_logs (table_name, record_id, changed_fields, changed_by_id)
  VALUES (
    'practitioners',
    p_id, 
    jsonb_build_object('action', 'HARD_DELETE', 'deleted_record_name', v_deleted_name), 
    auth.uid()
    );

  -- Hard delete all outreach_visits for this practitioner (to satisfy FK constraint)
  DELETE FROM outreach_visits WHERE practitioner_id = p_id;
  DELETE FROM planned_visits WHERE practitioner_id = p_id;
  DELETE FROM training WHERE id = p_id;

  -- Hard delete the practitioner
  DELETE FROM practitioners WHERE id = p_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Practitioner permanently deleted',
    'name', v_deleted_name,
    'visits_deleted', v_visit_count
  );
END;
$$;

ALTER FUNCTION "public"."hard_delete_practitioner"("uuid") OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."hard_delete_practitioner"("uuid") TO "authenticated";

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
  v_practitioner_count int;
BEGIN
  -- Authorization: admin only
  v_role := public.get_my_role();
  IF v_role != 'administrator' THEN
    RETURN jsonb_build_object(
      'error', 'Only administrators can permanently delete records',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  -- Check record exists and is soft-deleted
  SELECT COUNT(*), name INTO v_count, v_deleted_name 
  FROM ecdc_list 
  WHERE id = e_id AND deleted_at IS NOT NULL;
  
  IF v_count = 0 THEN
    RETURN jsonb_build_object(
      'error', 'ECDC not found or not soft-deleted',
      'code', 'NOT_FOUND'
    );
  END IF;

  -- Count practitioners that will become unassigned (FK ON DELETE SET NULL)
  SELECT COUNT(*) INTO v_practitioner_count 
  FROM practitioners 
  WHERE ecdc_id = e_id;

  INSERT INTO public.audit_logs (table_name, record_id, changed_fields, changed_by_id)
  VALUES (
    'ecdc_list',
    e_id, 
    jsonb_build_object('action', 'HARD_DELETE', 'deleted_record_name', v_deleted_name), 
    auth.uid()
    );

  -- Hard delete the ECDC (practitioners.ecdc_id becomes NULL via FK cascade)
  DELETE FROM ecdc_list WHERE id = e_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'ECDC permanently deleted',
    'name', v_deleted_name,
    'practitioners_unassigned', v_practitioner_count
  );
END;
$$;

ALTER FUNCTION "public"."hard_delete_ecdc"("uuid") OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."hard_delete_ecdc"("uuid") TO "authenticated";

-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."hard_delete_outreach_visit"(
  "v_id" "uuid"
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_count int;
  v_deleted_date date;
BEGIN
  -- Authorization: admin only
  v_role := public.get_my_role();
  IF v_role != 'administrator' THEN
    RETURN jsonb_build_object(
      'error', 'Only administrators can permanently delete records',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  -- Check record exists and is soft-deleted
  SELECT COUNT(*), date INTO v_count, v_deleted_date 
  FROM outreach_visits 
  WHERE id = v_id AND deleted_at IS NOT NULL;
  
  IF v_count = 0 THEN
    RETURN jsonb_build_object(
      'error', 'Outreach visit not found or not soft-deleted',
      'code', 'NOT_FOUND'
    );
  END IF;

  INSERT INTO public.audit_logs (table_name, record_id, changed_fields, changed_by_id)
  VALUES (
    'outreach_visits',
    v_id, 
    jsonb_build_object('action', 'HARD_DELETE', 'deleted_record_name', v_deleted_name), 
    auth.uid()
    );

  -- Hard delete the visit
  DELETE FROM outreach_visits WHERE id = v_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Outreach visit permanently deleted',
    'date', v_deleted_date
  );
END;
$$;

ALTER FUNCTION "public"."hard_delete_outreach_visit"("uuid") OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."hard_delete_outreach_visit"("uuid") TO "authenticated";

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 5: Update RLS Policies to Filter Soft-Deleted Records
-- 
-- All SELECT queries must not show soft-deleted records to regular users.
-- We drop and recreate the policies to add the deleted_at IS NULL filter.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- practitioners policies
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "practitioners: authenticated read" ON "public"."practitioners";

CREATE POLICY "practitioners: authenticated read" ON "public"."practitioners" 
FOR SELECT TO "authenticated" 
USING ("deleted_at" IS NULL);

-- administrator write remains unchanged (they can write to any record including deleted ones)

DROP POLICY IF EXISTS "practitioners: manager update" ON "public"."practitioners";

CREATE POLICY "practitioners: manager update" ON "public"."practitioners" 
FOR UPDATE TO "authenticated" 
USING (("public"."get_my_role"() = 'manager'::"text") AND ("deleted_at" IS NULL))
WITH CHECK (("public"."get_my_role"() = 'manager'::"text"));

-- ─────────────────────────────────────────────────────────────────────────────
-- ecdc_list policies
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "ecdc_list: authenticated read" ON "public"."ecdc_list";

CREATE POLICY "ecdc_list: authenticated read" ON "public"."ecdc_list" 
FOR SELECT TO "authenticated" 
USING ("deleted_at" IS NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- outreach_visits policies
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "outreach_visits: authenticated read" ON "public"."outreach_visits";

CREATE POLICY "outreach_visits: authenticated read" ON "public"."outreach_visits" 
FOR SELECT TO "authenticated" 
USING ("deleted_at" IS NULL);

DROP POLICY IF EXISTS "outreach_visits: datacapturer update own" ON "public"."outreach_visits";

CREATE POLICY "outreach_visits: datacapturer update own" ON "public"."outreach_visits" 
FOR UPDATE TO "authenticated" 
USING (
  ("public"."get_my_role"() = 'datacapturer'::"text") 
  AND ("data_capturer_id" = ( 
    SELECT "ls"."id"
    FROM ("public"."layita_staff" "ls"
    JOIN "public"."profiles" "p" ON (("lower"("p"."name") = "lower"("ls"."name"))))
    WHERE ("p"."id" = "auth"."uid"())
  ))
  AND ("source" <> 'kobo'::"text")
  AND ("deleted_at" IS NULL)
) 
WITH CHECK (("public"."get_my_role"() = 'datacapturer'::"text"));

DROP POLICY IF EXISTS "outreach_visits: manager update" ON "public"."outreach_visits";

CREATE POLICY "outreach_visits: manager update" ON "public"."outreach_visits" 
FOR UPDATE TO "authenticated" 
USING (("public"."get_my_role"() = 'manager'::"text") AND ("deleted_at" IS NULL))
WITH CHECK (("public"."get_my_role"() = 'manager'::"text"));

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 6: Admin Helper Functions for Deleted Records View
-- 
-- These functions allow admins to view soft-deleted records.
-- They bypass the normal RLS policies (SECURITY DEFINER) but check role first.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION "public"."get_deleted_practitioners"()
RETURNS TABLE(
  "id" "uuid",
  "created_at" timestamp with time zone,
  "name" text,
  "contact_number1" text,
  "contact_number2" text,
  "ecdc_id" "uuid",
  "updated_at" timestamp with time zone,
  "group_id" "uuid",
  "dsd_funded" boolean,
  "dsd_registered" boolean,
  "has_whatsapp" boolean,
  "group" text,
  "status" text,
  "deleted_at" timestamp with time zone
)
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
BEGIN
  IF public.get_my_role() != 'administrator' THEN
    RAISE EXCEPTION 'Only administrators can view deleted records';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.created_at, p.name, p.contact_number1, p.contact_number2,
    p.ecdc_id, p.updated_at, p.group_id, p.dsd_funded, p.dsd_registered,
    p.has_whatsapp, p.group, p.status, p.deleted_at
  FROM practitioners p
  WHERE p.deleted_at IS NOT NULL
  ORDER BY p.deleted_at DESC;
END;
$$;

ALTER FUNCTION "public"."get_deleted_practitioners"() OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_deleted_practitioners"() TO "authenticated";

-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."get_deleted_ecdcs"()
RETURNS TABLE(
  "id" "uuid",
  "created_at" timestamp with time zone,
  "name" text,
  "area" text,
  "location" "public"."geography",
  "longitude" double precision,
  "latitude" double precision,
  "area_id" "uuid",
  "chief" text,
  "headman" text,
  "number_children" text,
  "attendance_updated" timestamp with time zone,
  "deleted_at" timestamp with time zone
)
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
BEGIN
  IF public.get_my_role() != 'administrator' THEN
    RAISE EXCEPTION 'Only administrators can view deleted records';
  END IF;

  RETURN QUERY
  SELECT
    e.id, e.created_at, e.name, e.area, e.location,
    e.longitude, e.latitude, e.area_id, e.chief, e.headman,
    e.number_children, e.attendance_updated, e.deleted_at
  FROM ecdc_list e
  WHERE e.deleted_at IS NOT NULL
  ORDER BY e.deleted_at DESC;
END;
$$;

ALTER FUNCTION "public"."get_deleted_ecdcs"() OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_deleted_ecdcs"() TO "authenticated";

-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."get_deleted_outreach_visits"()
RETURNS TABLE(
  "id" "uuid",
  "created_at" timestamp with time zone,
  "date" date,
  "practitioner_id" "uuid",
  "outreach_type" text,
  "transport_type" text,
  "transport_cost" numeric,
  "transport_km" numeric,
  "parents_trained" numeric,
  "children_books" numeric,
  "books_per_child" numeric,
  "books_to_practitioner" numeric,
  "data_capturer_id" "uuid",
  "photos_taken" boolean,
  "comments" text,
  "outreach_happened" text,
  "did_instead" text,
  "parents_enrolled" numeric,
  "kobo_instance_id" text,
  "source" text,
  "people_reached" numeric,
  "deleted_at" timestamp with time zone
)
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
BEGIN
  IF public.get_my_role() != 'administrator' THEN
    RAISE EXCEPTION 'Only administrators can view deleted records';
  END IF;

  RETURN QUERY
  SELECT
    v.id, v.created_at, v.date, v.practitioner_id, v.outreach_type,
    v.transport_type, v.transport_cost, v.transport_km, v.parents_trained,
    v.children_books, v.books_per_child, v.books_to_practitioner,
    v.data_capturer_id, v.photos_taken, v.comments, v.outreach_happened,
    v.did_instead, v.parents_enrolled, v.kobo_instance_id, v.source,
    v.people_reached, v.deleted_at
  FROM outreach_visits v
  WHERE v.deleted_at IS NOT NULL
  ORDER BY v.deleted_at DESC;
END;
$$;

ALTER FUNCTION "public"."get_deleted_outreach_visits"() OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_deleted_outreach_visits"() TO "authenticated";

-- update export views to only include non-deleted records

CREATE OR REPLACE VIEW "public"."kobotoolbox_ecdc_export" AS
 SELECT ("e"."id")::"text" AS "name",
    "e"."name" AS "label",
    "g"."group_name" AS "franchise_group",
    "e"."area",
    'ecdcs'::"text" AS "list_name",
    "p"."name" AS "ecdc_practitioner",
        CASE
            WHEN ("p"."dsd_funded" = true) THEN 'Yes'::"text"
            WHEN ("p"."dsd_funded" = false) THEN 'No'::"text"
            ELSE '-'::"text"
        END AS "ecdc_dsd"
   FROM "public"."ecdc_list" "e"
     LEFT JOIN "public"."practitioners" "p" 
       ON (("p"."ecdc_id" = "e"."id") AND "p"."deleted_at" IS NULL)
     LEFT JOIN "public"."groups" "g" 
       ON (("p"."group_id" = "g"."id"))
   WHERE "e"."deleted_at" IS NULL;


ALTER VIEW "public"."kobotoolbox_ecdc_export" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."kobotoolbox_practitioners_export" AS
 SELECT ("p"."id")::"text" AS "name",
    "p"."name" AS "label",
    ("p"."ecdc_id")::"text" AS "ecdc",
    "p"."contact_number1" AS "contact1",
    "p"."contact_number2" AS "contact2",
    'practitioners'::"text" AS "list_name"
   FROM ("public"."practitioners" "p"
     LEFT JOIN "public"."ecdc_list" "e" ON (("e"."id" = "p"."ecdc_id")))
   WHERE "p"."deleted_at" IS NULL;


ALTER VIEW "public"."kobotoolbox_practitioners_export" OWNER TO "postgres";

-- ═══════════════════════════════════════════════════════════════════════════
-- End of Migration
-- ═══════════════════════════════════════════════════════════════════════════
