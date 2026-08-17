drop policy "correction_requests: authenticated create own" on "public"."correction_requests";

drop policy "correction_requests: read own or reviewer" on "public"."correction_requests";

drop policy "correction_requests: reviewer update" on "public"."correction_requests";

revoke delete on table "public"."correction_requests" from "authenticated";

revoke insert on table "public"."correction_requests" from "authenticated";

revoke references on table "public"."correction_requests" from "authenticated";

revoke select on table "public"."correction_requests" from "authenticated";

revoke trigger on table "public"."correction_requests" from "authenticated";

revoke truncate on table "public"."correction_requests" from "authenticated";

revoke update on table "public"."correction_requests" from "authenticated";

revoke delete on table "public"."correction_requests" from "service_role";

revoke insert on table "public"."correction_requests" from "service_role";

revoke references on table "public"."correction_requests" from "service_role";

revoke select on table "public"."correction_requests" from "service_role";

revoke trigger on table "public"."correction_requests" from "service_role";

revoke truncate on table "public"."correction_requests" from "service_role";

revoke update on table "public"."correction_requests" from "service_role";

alter table "public"."correction_requests" drop constraint "correction_requests_assigned_to_id_fkey";

alter table "public"."correction_requests" drop constraint "correction_requests_created_by_id_fkey";

alter table "public"."correction_requests" drop constraint "correction_requests_resolved_by_id_fkey";

alter table "public"."correction_requests" drop constraint "correction_requests_status_check";

alter table "public"."correction_requests" drop constraint "correction_requests_target_table_check";

drop view if exists "public"."data_quality_summary";

drop function if exists "public"."get_deleted_ecdcs"();

drop function if exists "public"."merge_ecdcs"(keep_id uuid, discard_id uuid, field_choices jsonb);

drop function if exists "public"."merge_practitioners"(keep_id uuid, discard_id uuid, field_choices jsonb);

drop function if exists "public"."resolve_ecdc_external_id"(raw_value text);

drop function if exists "public"."resolve_practitioner_external_id"(raw_value text);

drop function if exists "public"."resolve_unmatched_submission"(p_unmatched_id uuid, p_resolved_id uuid, p_resolution_type text, p_note text);

drop function if exists "public"."restore_ecdc"(e_id uuid);

drop function if exists "public"."restore_outreach_visit"(v_id uuid);

drop function if exists "public"."restore_practitioner"(p_id uuid);

alter table "public"."correction_requests" drop constraint "correction_requests_pkey";

drop index if exists "public"."correction_requests_created_by_id_idx";

drop index if exists "public"."correction_requests_pkey";

drop index if exists "public"."correction_requests_status_idx";

drop index if exists "public"."correction_requests_target_idx";

drop table "public"."correction_requests";

alter table "public"."planned_visits" alter column "assigned_to" set not null;

alter table "public"."training" drop column "first_aid_date";

alter table "public"."training" drop column "level4_date";

alter table "public"."training" drop column "level5_date";

alter table "public"."training" drop column "littlestars_date";

alter table "public"."training" drop column "other_date";

alter table "public"."training" drop column "smart_start_date";

alter table "public"."training" drop column "wordworks03_date";

alter table "public"."training" drop column "wordworks35_date";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.merge_practitioners(keep_id uuid, discard_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  update outreach_visits set practitioner_id = keep_id where practitioner_id = discard_id;
  update training set id = keep_id where id = discard_id; -- careful with PK
  delete from practitioners where id = discard_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hard_delete_ecdc(e_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.hard_delete_outreach_visit(v_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.hard_delete_practitioner(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.soft_delete_ecdc(e_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.soft_delete_outreach_visit(v_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.soft_delete_practitioner(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

grant delete on table "public"."planned_visits" to "anon";

grant insert on table "public"."planned_visits" to "anon";

grant references on table "public"."planned_visits" to "anon";

grant select on table "public"."planned_visits" to "anon";

grant trigger on table "public"."planned_visits" to "anon";

grant truncate on table "public"."planned_visits" to "anon";

grant update on table "public"."planned_visits" to "anon";


