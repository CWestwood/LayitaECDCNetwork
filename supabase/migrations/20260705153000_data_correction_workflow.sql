-- Data correction workflow foundations.
--
-- Local-first migration for:
-- 1. Correction requests from staff.
-- 2. Restore RPCs for soft-deleted records.
-- 3. Admin/manager unmatched-resolution and practitioner-merge RPCs.
-- 4. A compact data-quality summary view for admin/M&E pages.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;

CREATE TABLE IF NOT EXISTS "public"."correction_requests" (
  "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "created_by_id" "uuid" DEFAULT "auth"."uid"(),
  "target_table" "text" NOT NULL,
  "target_id" "uuid",
  "issue_type" "text" NOT NULL,
  "description" "text" NOT NULL,
  "status" "text" DEFAULT 'open'::"text" NOT NULL,
  "assigned_to_id" "uuid",
  "resolution_notes" "text",
  "resolved_by_id" "uuid",
  "resolved_at" timestamp with time zone,
  CONSTRAINT "correction_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "correction_requests_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'reviewing'::"text", 'resolved'::"text", 'rejected'::"text"]))),
  CONSTRAINT "correction_requests_target_table_check" CHECK (("target_table" = ANY (ARRAY['practitioners'::"text", 'ecdc_list'::"text", 'outreach_visits'::"text", 'planned_visits'::"text", 'kobo_raw_submissions'::"text", 'other'::"text"])))
);

ALTER TABLE "public"."correction_requests" OWNER TO "postgres";

ALTER TABLE ONLY "public"."correction_requests"
  DROP CONSTRAINT IF EXISTS "correction_requests_created_by_id_fkey";
ALTER TABLE ONLY "public"."correction_requests"
  ADD CONSTRAINT "correction_requests_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."correction_requests"
  DROP CONSTRAINT IF EXISTS "correction_requests_assigned_to_id_fkey";
ALTER TABLE ONLY "public"."correction_requests"
  ADD CONSTRAINT "correction_requests_assigned_to_id_fkey"
  FOREIGN KEY ("assigned_to_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."correction_requests"
  DROP CONSTRAINT IF EXISTS "correction_requests_resolved_by_id_fkey";
ALTER TABLE ONLY "public"."correction_requests"
  ADD CONSTRAINT "correction_requests_resolved_by_id_fkey"
  FOREIGN KEY ("resolved_by_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "correction_requests_status_idx"
  ON "public"."correction_requests" ("status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "correction_requests_target_idx"
  ON "public"."correction_requests" ("target_table", "target_id");
CREATE INDEX IF NOT EXISTS "correction_requests_created_by_id_idx"
  ON "public"."correction_requests" ("created_by_id");

ALTER TABLE "public"."correction_requests" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "correction_requests: read own or reviewer" ON "public"."correction_requests";
CREATE POLICY "correction_requests: read own or reviewer"
ON "public"."correction_requests"
FOR SELECT TO "authenticated"
USING (
  ("created_by_id" = "auth"."uid"())
  OR ("public"."get_my_role"() = ANY (ARRAY['administrator'::"text", 'manager'::"text"]))
);

DROP POLICY IF EXISTS "correction_requests: authenticated create own" ON "public"."correction_requests";
CREATE POLICY "correction_requests: authenticated create own"
ON "public"."correction_requests"
FOR INSERT TO "authenticated"
WITH CHECK ("created_by_id" = "auth"."uid"());

DROP POLICY IF EXISTS "correction_requests: reviewer update" ON "public"."correction_requests";
CREATE POLICY "correction_requests: reviewer update"
ON "public"."correction_requests"
FOR UPDATE TO "authenticated"
USING ("public"."get_my_role"() = ANY (ARRAY['administrator'::"text", 'manager'::"text"]))
WITH CHECK ("public"."get_my_role"() = ANY (ARRAY['administrator'::"text", 'manager'::"text"]));

CREATE OR REPLACE FUNCTION "public"."restore_practitioner"("p_id" "uuid")
RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_name text;
BEGIN
  v_role := public.get_my_role();
  IF v_role != 'administrator' THEN
    RETURN jsonb_build_object('error', 'Only administrators can restore practitioners', 'code', 'UNAUTHORIZED');
  END IF;

  SELECT p.name INTO v_name
  FROM public.practitioners p
  WHERE p.id = p_id AND p.deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Practitioner not found or not deleted', 'code', 'NOT_FOUND');
  END IF;

  UPDATE public.practitioners SET deleted_at = NULL WHERE id = p_id;

  INSERT INTO public.audit_logs (table_name, record_id, changed_fields, changed_by_id)
  VALUES ('practitioners', p_id, jsonb_build_object('action', 'RESTORE', 'record_name', v_name), auth.uid());

  RETURN jsonb_build_object('success', true, 'message', 'Practitioner restored', 'name', v_name);
END;
$$;

CREATE OR REPLACE FUNCTION "public"."restore_ecdc"("e_id" "uuid")
RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_name text;
BEGIN
  v_role := public.get_my_role();
  IF v_role != 'administrator' THEN
    RETURN jsonb_build_object('error', 'Only administrators can restore ECDCs', 'code', 'UNAUTHORIZED');
  END IF;

  SELECT e.name INTO v_name
  FROM public.ecdc_list e
  WHERE e.id = e_id AND e.deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ECDC not found or not deleted', 'code', 'NOT_FOUND');
  END IF;

  UPDATE public.ecdc_list SET deleted_at = NULL WHERE id = e_id;

  INSERT INTO public.audit_logs (table_name, record_id, changed_fields, changed_by_id)
  VALUES ('ecdc_list', e_id, jsonb_build_object('action', 'RESTORE', 'record_name', v_name), auth.uid());

  RETURN jsonb_build_object('success', true, 'message', 'ECDC restored', 'name', v_name);
END;
$$;

CREATE OR REPLACE FUNCTION "public"."restore_outreach_visit"("v_id" "uuid")
RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_date date;
BEGIN
  v_role := public.get_my_role();
  IF v_role != 'administrator' THEN
    RETURN jsonb_build_object('error', 'Only administrators can restore visits', 'code', 'UNAUTHORIZED');
  END IF;

  SELECT v.date INTO v_date
  FROM public.outreach_visits v
  WHERE v.id = v_id AND v.deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Outreach visit not found or not deleted', 'code', 'NOT_FOUND');
  END IF;

  UPDATE public.outreach_visits SET deleted_at = NULL WHERE id = v_id;

  INSERT INTO public.audit_logs (table_name, record_id, changed_fields, changed_by_id)
  VALUES ('outreach_visits', v_id, jsonb_build_object('action', 'RESTORE', 'record_date', v_date), auth.uid());

  RETURN jsonb_build_object('success', true, 'message', 'Outreach visit restored', 'date', v_date);
END;
$$;

CREATE OR REPLACE FUNCTION "public"."resolve_unmatched_submission"(
  "p_unmatched_id" "uuid",
  "p_resolved_id" "uuid" DEFAULT NULL,
  "p_resolution_type" "text" DEFAULT 'link',
  "p_note" "text" DEFAULT NULL
)
RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_unmatched public.kobo_unmatched%ROWTYPE;
BEGIN
  v_role := public.get_my_role();
  IF v_role <> ALL (ARRAY['administrator', 'manager']) THEN
    RETURN jsonb_build_object('error', 'Only administrators and managers can resolve unmatched records', 'code', 'UNAUTHORIZED');
  END IF;

  SELECT * INTO v_unmatched
  FROM public.kobo_unmatched
  WHERE id = p_unmatched_id AND resolved_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Unmatched record not found or already resolved', 'code', 'NOT_FOUND');
  END IF;

  IF p_resolution_type NOT IN ('link', 'create', 'reviewed', 'ignore') THEN
    RETURN jsonb_build_object('error', 'Unsupported resolution type', 'code', 'INVALID_RESOLUTION_TYPE');
  END IF;

  IF p_resolution_type = 'link' AND p_resolved_id IS NULL THEN
    RETURN jsonb_build_object('error', 'A linked resolution requires resolved_id', 'code', 'MISSING_RESOLVED_ID');
  END IF;

  UPDATE public.kobo_unmatched
  SET resolved_id = p_resolved_id,
      resolved_at = now(),
      resolved_by = auth.uid()
  WHERE id = p_unmatched_id;

  INSERT INTO public.audit_logs (table_name, record_id, changed_fields, changed_by_id)
  VALUES (
    'kobo_unmatched',
    p_unmatched_id,
    jsonb_build_object(
      'action', 'RESOLVE_UNMATCHED',
      'instance_id', v_unmatched.instance_id,
      'field', v_unmatched.field,
      'raw_value', v_unmatched.raw_value,
      'resolved_id', p_resolved_id,
      'resolution_type', p_resolution_type,
      'note', p_note
    ),
    auth.uid()
  );

  RETURN jsonb_build_object('success', true, 'message', 'Unmatched record resolved', 'id', p_unmatched_id);
END;
$$;

DROP FUNCTION IF EXISTS "public"."merge_practitioners"("uuid", "uuid");
CREATE OR REPLACE FUNCTION "public"."merge_practitioners"("keep_id" "uuid", "discard_id" "uuid")
RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_keep_name text;
  v_discard_name text;
  v_visit_count int;
  v_plan_count int;
BEGIN
  v_role := public.get_my_role();
  IF v_role <> ALL (ARRAY['administrator', 'manager']) THEN
    RETURN jsonb_build_object('error', 'Only administrators and managers can merge practitioners', 'code', 'UNAUTHORIZED');
  END IF;

  IF keep_id = discard_id THEN
    RETURN jsonb_build_object('error', 'Cannot merge a practitioner into itself', 'code', 'INVALID_MERGE');
  END IF;

  SELECT name INTO v_keep_name
  FROM public.practitioners
  WHERE id = keep_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Practitioner to keep not found', 'code', 'KEEP_NOT_FOUND');
  END IF;

  SELECT name INTO v_discard_name
  FROM public.practitioners
  WHERE id = discard_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Practitioner to merge not found', 'code', 'DISCARD_NOT_FOUND');
  END IF;

  UPDATE public.outreach_visits
  SET practitioner_id = keep_id
  WHERE practitioner_id = discard_id;
  GET DIAGNOSTICS v_visit_count = ROW_COUNT;

  UPDATE public.planned_visits
  SET practitioner_id = keep_id,
      practitioner_name = v_keep_name,
      updated_at = now()
  WHERE practitioner_id = discard_id;
  GET DIAGNOSTICS v_plan_count = ROW_COUNT;

  IF EXISTS (SELECT 1 FROM public.training WHERE id = keep_id)
     AND EXISTS (SELECT 1 FROM public.training WHERE id = discard_id) THEN
    UPDATE public.training keep_training
    SET smart_start_ever = COALESCE(keep_training.smart_start_ever, false) OR COALESCE(discard_training.smart_start_ever, false),
        first_aid_ever = COALESCE(keep_training.first_aid_ever, false) OR COALESCE(discard_training.first_aid_ever, false),
        level4_ever = COALESCE(keep_training.level4_ever, false) OR COALESCE(discard_training.level4_ever, false),
        level5_ever = COALESCE(keep_training.level5_ever, false) OR COALESCE(discard_training.level5_ever, false),
        wordworks03_ever = COALESCE(keep_training.wordworks03_ever, false) OR COALESCE(discard_training.wordworks03_ever, false),
        wordworks35_ever = COALESCE(keep_training.wordworks35_ever, false) OR COALESCE(discard_training.wordworks35_ever, false),
        littlestars_ever = COALESCE(keep_training.littlestars_ever, false) OR COALESCE(discard_training.littlestars_ever, false),
        other = NULLIF(
          trim(BOTH '; ' FROM concat_ws('; ', NULLIF(keep_training.other, ''), NULLIF(discard_training.other, ''))),
          ''
        )
    FROM public.training discard_training
    WHERE keep_training.id = keep_id
      AND discard_training.id = discard_id;

    DELETE FROM public.training WHERE id = discard_id;
  ELSIF EXISTS (SELECT 1 FROM public.training WHERE id = discard_id) THEN
    UPDATE public.training SET id = keep_id WHERE id = discard_id;
  END IF;

  UPDATE public.practitioners
  SET deleted_at = now(),
      status = COALESCE(status, 'inactive')
  WHERE id = discard_id;

  INSERT INTO public.audit_logs (table_name, record_id, changed_fields, changed_by_id)
  VALUES (
    'practitioners',
    keep_id,
    jsonb_build_object(
      'action', 'MERGE_PRACTITIONERS',
      'kept_name', v_keep_name,
      'discarded_id', discard_id,
      'discarded_name', v_discard_name,
      'visits_moved', v_visit_count,
      'planned_visits_moved', v_plan_count
    ),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Practitioners merged',
    'kept_name', v_keep_name,
    'discarded_name', v_discard_name,
    'visits_moved', v_visit_count,
    'planned_visits_moved', v_plan_count
  );
END;
$$;

CREATE OR REPLACE VIEW "public"."data_quality_summary" AS
SELECT 'unmatched_open'::text AS metric_key,
       'Unmatched Kobo values'::text AS label,
       COUNT(*)::integer AS value,
       'high'::text AS severity
FROM public.kobo_unmatched
WHERE resolved_at IS NULL
UNION ALL
SELECT 'failed_submissions', 'Failed Kobo submissions', COUNT(*)::integer, 'critical'
FROM public.kobo_processed
WHERE status = 'failed'
UNION ALL
SELECT 'partial_submissions', 'Partial Kobo submissions', COUNT(*)::integer, 'high'
FROM public.kobo_processed
WHERE status = 'partial'
UNION ALL
SELECT 'visits_without_practitioner', 'Visits without practitioner', COUNT(*)::integer, 'high'
FROM public.outreach_visits
WHERE practitioner_id IS NULL AND deleted_at IS NULL
UNION ALL
SELECT 'ecdcs_without_coordinates', 'ECDCs without coordinates', COUNT(*)::integer, 'medium'
FROM public.ecdc_list
WHERE deleted_at IS NULL AND (latitude IS NULL OR longitude IS NULL)
UNION ALL
SELECT 'practitioners_without_ecdc', 'Practitioners without ECDC', COUNT(*)::integer, 'medium'
FROM public.practitioners
WHERE deleted_at IS NULL AND ecdc_id IS NULL
UNION ALL
SELECT 'old_attendance_counts', 'ECDCs with old or missing attendance counts', COUNT(*)::integer, 'medium'
FROM public.ecdc_list
WHERE deleted_at IS NULL
  AND (attendance_updated IS NULL OR attendance_updated < now() - interval '6 months')
UNION ALL
SELECT 'missing_contact_numbers', 'Practitioners without contact numbers', COUNT(*)::integer, 'medium'
FROM public.practitioners
WHERE deleted_at IS NULL
  AND NULLIF(trim(COALESCE(contact_number1, '') || COALESCE(contact_number2, '')), '') IS NULL;

ALTER VIEW "public"."data_quality_summary" OWNER TO "postgres";

GRANT SELECT ON TABLE "public"."data_quality_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."correction_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."correction_requests" TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."restore_practitioner"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."restore_ecdc"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."restore_outreach_visit"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."resolve_unmatched_submission"("uuid", "uuid", "text", "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."merge_practitioners"("uuid", "uuid") TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."restore_practitioner"("uuid") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."restore_ecdc"("uuid") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."restore_outreach_visit"("uuid") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."resolve_unmatched_submission"("uuid", "uuid", "text", "text") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."merge_practitioners"("uuid", "uuid") TO "service_role";

REVOKE ALL ON TABLE "public"."correction_requests" FROM "anon";
REVOKE ALL ON TABLE "public"."data_quality_summary" FROM "anon";
REVOKE ALL ON FUNCTION "public"."restore_practitioner"("uuid") FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."restore_ecdc"("uuid") FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."restore_outreach_visit"("uuid") FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."resolve_unmatched_submission"("uuid", "uuid", "text", "text") FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."merge_practitioners"("uuid", "uuid") FROM PUBLIC, "anon";
