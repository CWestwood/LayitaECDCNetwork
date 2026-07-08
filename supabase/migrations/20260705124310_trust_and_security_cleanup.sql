-- Trust and security cleanup for Layita ECDC Network
--
-- This migration is intentionally narrow:
-- 1. Repair delete RPCs that used invalid aggregate SELECT patterns.
-- 2. Remove unnecessary anonymous privileges from operational tables, views, and RPCs.
-- 3. Prevent future public-schema objects created by postgres from being auto-granted to anon.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;

CREATE OR REPLACE FUNCTION "public"."soft_delete_practitioner"("p_id" "uuid")
RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_name text;
  v_deleted_at timestamptz;
BEGIN
  v_role := public.get_my_role();
  IF v_role != 'administrator' THEN
    RETURN jsonb_build_object(
      'error', 'Only administrators can delete practitioners',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  SELECT p.name INTO v_name
  FROM practitioners p
  WHERE p.id = p_id AND p.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', 'Practitioner not found or already deleted',
      'code', 'NOT_FOUND'
    );
  END IF;

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

CREATE OR REPLACE FUNCTION "public"."soft_delete_ecdc"("e_id" "uuid")
RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_name text;
  v_deleted_at timestamptz;
  v_linked_practitioners int;
BEGIN
  v_role := public.get_my_role();
  IF v_role != 'administrator' THEN
    RETURN jsonb_build_object(
      'error', 'Only administrators can delete ECDCs',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  SELECT e.name INTO v_name
  FROM ecdc_list e
  WHERE e.id = e_id AND e.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', 'ECDC not found or already deleted',
      'code', 'NOT_FOUND'
    );
  END IF;

  SELECT COUNT(*) INTO v_linked_practitioners
  FROM practitioners
  WHERE ecdc_id = e_id AND deleted_at IS NULL;

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

CREATE OR REPLACE FUNCTION "public"."soft_delete_outreach_visit"("v_id" "uuid")
RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_date date;
  v_deleted_at timestamptz;
BEGIN
  v_role := public.get_my_role();
  IF v_role != 'administrator' THEN
    RETURN jsonb_build_object(
      'error', 'Only administrators can delete visits',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  SELECT v.date INTO v_date
  FROM outreach_visits v
  WHERE v.id = v_id AND v.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', 'Outreach visit not found or already deleted',
      'code', 'NOT_FOUND'
    );
  END IF;

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

CREATE OR REPLACE FUNCTION "public"."hard_delete_practitioner"("p_id" "uuid")
RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_deleted_name text;
  v_visit_count int;
BEGIN
  v_role := public.get_my_role();
  IF v_role != 'administrator' THEN
    RETURN jsonb_build_object(
      'error', 'Only administrators can permanently delete records',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  SELECT p.name INTO v_deleted_name
  FROM practitioners p
  WHERE p.id = p_id AND p.deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', 'Practitioner not found or not soft-deleted',
      'code', 'NOT_FOUND'
    );
  END IF;

  SELECT COUNT(*) INTO v_visit_count
  FROM outreach_visits
  WHERE practitioner_id = p_id;

  INSERT INTO public.audit_logs (table_name, record_id, changed_fields, changed_by_id)
  VALUES (
    'practitioners',
    p_id,
    jsonb_build_object('action', 'HARD_DELETE', 'deleted_record_name', v_deleted_name),
    auth.uid()
  );

  DELETE FROM outreach_visits WHERE practitioner_id = p_id;
  DELETE FROM planned_visits WHERE practitioner_id = p_id;
  DELETE FROM training WHERE id = p_id;
  DELETE FROM practitioners WHERE id = p_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Practitioner permanently deleted',
    'name', v_deleted_name,
    'visits_deleted', v_visit_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."hard_delete_ecdc"("e_id" "uuid")
RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_deleted_name text;
  v_practitioner_count int;
BEGIN
  v_role := public.get_my_role();
  IF v_role != 'administrator' THEN
    RETURN jsonb_build_object(
      'error', 'Only administrators can permanently delete records',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  SELECT e.name INTO v_deleted_name
  FROM ecdc_list e
  WHERE e.id = e_id AND e.deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', 'ECDC not found or not soft-deleted',
      'code', 'NOT_FOUND'
    );
  END IF;

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

  DELETE FROM ecdc_list WHERE id = e_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'ECDC permanently deleted',
    'name', v_deleted_name,
    'practitioners_unassigned', v_practitioner_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."hard_delete_outreach_visit"("v_id" "uuid")
RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_deleted_date date;
BEGIN
  v_role := public.get_my_role();
  IF v_role != 'administrator' THEN
    RETURN jsonb_build_object(
      'error', 'Only administrators can permanently delete records',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  SELECT v.date INTO v_deleted_date
  FROM outreach_visits v
  WHERE v.id = v_id AND v.deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', 'Outreach visit not found or not soft-deleted',
      'code', 'NOT_FOUND'
    );
  END IF;

  INSERT INTO public.audit_logs (table_name, record_id, changed_fields, changed_by_id)
  VALUES (
    'outreach_visits',
    v_id,
    jsonb_build_object('action', 'HARD_DELETE', 'deleted_record_date', v_deleted_date),
    auth.uid()
  );

  DELETE FROM outreach_visits WHERE id = v_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Outreach visit permanently deleted',
    'date', v_deleted_date
  );
END;
$$;

ALTER FUNCTION "public"."soft_delete_practitioner"("uuid") OWNER TO "postgres";
ALTER FUNCTION "public"."soft_delete_ecdc"("uuid") OWNER TO "postgres";
ALTER FUNCTION "public"."soft_delete_outreach_visit"("uuid") OWNER TO "postgres";
ALTER FUNCTION "public"."hard_delete_practitioner"("uuid") OWNER TO "postgres";
ALTER FUNCTION "public"."hard_delete_ecdc"("uuid") OWNER TO "postgres";
ALTER FUNCTION "public"."hard_delete_outreach_visit"("uuid") OWNER TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."soft_delete_practitioner"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."soft_delete_ecdc"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."soft_delete_outreach_visit"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."hard_delete_practitioner"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."hard_delete_ecdc"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."hard_delete_outreach_visit"("uuid") TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."soft_delete_practitioner"("uuid") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."soft_delete_ecdc"("uuid") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."soft_delete_outreach_visit"("uuid") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."hard_delete_practitioner"("uuid") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."hard_delete_ecdc"("uuid") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."hard_delete_outreach_visit"("uuid") TO "service_role";

-- Sensitive or authenticated-only RPCs should not be executable by anon.
-- Revoke from PUBLIC as well because functions are executable by PUBLIC by default.
REVOKE ALL ON FUNCTION "public"."find_similar_practitioners"("text") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_deleted_ecdcs"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_deleted_outreach_visits"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_deleted_practitioners"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_my_role"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."hard_delete_ecdc"("uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."hard_delete_outreach_visit"("uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."hard_delete_practitioner"("uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."log_table_updates"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."merge_practitioners"("uuid", "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."refresh_dashboard_views"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."set_attendance_updated"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."soft_delete_ecdc"("uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."soft_delete_outreach_visit"("uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."soft_delete_practitioner"("uuid") FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."find_similar_practitioners"("text") FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_deleted_ecdcs"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_deleted_outreach_visits"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_deleted_practitioners"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_my_role"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."hard_delete_ecdc"("uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."hard_delete_outreach_visit"("uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."hard_delete_practitioner"("uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."log_table_updates"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."merge_practitioners"("uuid", "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."refresh_dashboard_views"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."set_attendance_updated"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."soft_delete_ecdc"("uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."soft_delete_outreach_visit"("uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."soft_delete_practitioner"("uuid") FROM "anon";

-- Remove anonymous table/view/sequence privileges. RLS is still the main guardrail,
-- but these grants should not exist unless a public endpoint is explicitly intended.
REVOKE ALL PRIVILEGES ON TABLE "public"."area" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."audit_logs" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."ecdc_list" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."groups" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."human_audit_logs" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."kobo_label" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."kobo_processed" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."kobo_raw_submissions" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."kobo_submission_monitor" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."kobo_unmatched" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."kobotoolbox_ecdc_export" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."kobotoolbox_practitioners_export" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."landmarks" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."layita_staff" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."outreach_visits" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."planned_visits" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."practitioners" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."profiles" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."training" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."visit_requirements" FROM "anon";
REVOKE ALL PRIVILEGES ON SEQUENCE "public"."landmarks_id_seq" FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  REVOKE ALL ON TABLES FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  REVOKE ALL ON SEQUENCES FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  REVOKE ALL ON FUNCTIONS FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
