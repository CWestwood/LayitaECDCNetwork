-- Phase 1: restore the application/database contract and align authorization.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- Role lookup and common timestamp trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.role FROM public.profiles p WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Correction requests
-- ---------------------------------------------------------------------------

CREATE TABLE public.correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE RESTRICT,
  target_table text NOT NULL,
  target_id uuid,
  issue_type text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  assigned_to_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolution_notes text,
  resolved_by_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  CONSTRAINT correction_requests_status_check
    CHECK (status IN ('open', 'reviewing', 'resolved', 'rejected')),
  CONSTRAINT correction_requests_target_table_check
    CHECK (target_table IN (
      'practitioners', 'ecdc_list', 'outreach_visits', 'planned_visits',
      'training_events', 'kobo_raw_submissions', 'other'
    )),
  CONSTRAINT correction_requests_description_check
    CHECK (nullif(pg_catalog.btrim(description), '') IS NOT NULL),
  CONSTRAINT correction_requests_resolution_check
    CHECK (
      (status IN ('open', 'reviewing') AND resolved_at IS NULL AND resolved_by_id IS NULL)
      OR (status IN ('resolved', 'rejected') AND resolved_at IS NOT NULL AND resolved_by_id IS NOT NULL)
    )
);

CREATE INDEX correction_requests_status_idx
  ON public.correction_requests (status, created_at DESC);
CREATE INDEX correction_requests_target_idx
  ON public.correction_requests (target_table, target_id);
CREATE INDEX correction_requests_created_by_id_idx
  ON public.correction_requests (created_by_id, created_at DESC);

CREATE TRIGGER correction_requests_set_updated_at
BEFORE UPDATE ON public.correction_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();

-- ---------------------------------------------------------------------------
-- Safe delete and restore RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.soft_delete_practitioner(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
  v_deleted_at timestamptz := now();
BEGIN
  IF public.get_my_role() <> 'administrator' THEN
    RETURN jsonb_build_object('error', 'Only administrators can delete practitioners', 'code', 'UNAUTHORIZED');
  END IF;

  SELECT p.name INTO v_name
  FROM public.practitioners p
  WHERE p.id = p_id AND p.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Practitioner not found or already deleted', 'code', 'NOT_FOUND');
  END IF;

  UPDATE public.practitioners
  SET deleted_at = v_deleted_at
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'success', true, 'message', 'Practitioner marked for deletion',
    'name', v_name, 'deleted_at', v_deleted_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_ecdc(e_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
  v_deleted_at timestamptz := now();
  v_linked_practitioners integer;
BEGIN
  IF public.get_my_role() <> 'administrator' THEN
    RETURN jsonb_build_object('error', 'Only administrators can delete ECDCs', 'code', 'UNAUTHORIZED');
  END IF;

  SELECT e.name INTO v_name
  FROM public.ecdc_list e
  WHERE e.id = e_id AND e.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ECDC not found or already deleted', 'code', 'NOT_FOUND');
  END IF;

  SELECT count(*)::integer INTO v_linked_practitioners
  FROM public.practitioners p
  WHERE p.ecdc_id = e_id AND p.deleted_at IS NULL;

  UPDATE public.ecdc_list SET deleted_at = v_deleted_at WHERE id = e_id;

  RETURN jsonb_build_object(
    'success', true, 'message', 'ECDC marked for deletion', 'name', v_name,
    'linked_practitioners', v_linked_practitioners,
    'note', 'Practitioners remain assigned; they become unassigned only after permanent deletion',
    'deleted_at', v_deleted_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_outreach_visit(v_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_date date;
  v_deleted_at timestamptz := now();
BEGIN
  IF public.get_my_role() <> 'administrator' THEN
    RETURN jsonb_build_object('error', 'Only administrators can delete visits', 'code', 'UNAUTHORIZED');
  END IF;

  SELECT v.date INTO v_date
  FROM public.outreach_visits v
  WHERE v.id = v_id AND v.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Outreach visit not found or already deleted', 'code', 'NOT_FOUND');
  END IF;

  UPDATE public.outreach_visits SET deleted_at = v_deleted_at WHERE id = v_id;

  RETURN jsonb_build_object(
    'success', true, 'message', 'Outreach visit marked for deletion',
    'date', v_date, 'deleted_at', v_deleted_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hard_delete_practitioner(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
  v_visit_count integer;
  v_plan_count integer;
BEGIN
  IF public.get_my_role() <> 'administrator' THEN
    RETURN jsonb_build_object('error', 'Only administrators can permanently delete records', 'code', 'UNAUTHORIZED');
  END IF;

  SELECT p.name INTO v_name
  FROM public.practitioners p
  WHERE p.id = p_id AND p.deleted_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Practitioner not found or not soft-deleted', 'code', 'NOT_FOUND');
  END IF;

  SELECT count(DISTINCT visit_id)::integer INTO v_visit_count
  FROM (
    SELECT ov.id AS visit_id FROM public.outreach_visits ov WHERE ov.practitioner_id = p_id
    UNION ALL
    SELECT ovp.visit_id FROM public.outreach_visit_practitioners ovp WHERE ovp.practitioner_id = p_id
  ) linked;

  SELECT count(*)::integer INTO v_plan_count
  FROM public.planned_visits pv WHERE pv.practitioner_id = p_id;

  INSERT INTO public.audit_logs (table_name, record_id, changed_fields, changed_by_id)
  VALUES (
    'practitioners', p_id,
    jsonb_build_object(
      'action', jsonb_build_object('old', null, 'new', 'HARD_DELETE'),
      'deleted_record_name', jsonb_build_object('old', v_name, 'new', null),
      'visits_unlinked', jsonb_build_object('old', v_visit_count, 'new', 0),
      'planned_visits_deleted', jsonb_build_object('old', v_plan_count, 'new', 0)
    ),
    auth.uid()
  );

  DELETE FROM public.planned_visits WHERE practitioner_id = p_id;
  DELETE FROM public.training WHERE id = p_id;
  DELETE FROM public.practitioners WHERE id = p_id;

  RETURN jsonb_build_object(
    'success', true, 'message', 'Practitioner permanently deleted', 'name', v_name,
    'visits_unlinked', v_visit_count, 'planned_visits_deleted', v_plan_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hard_delete_ecdc(e_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
  v_practitioner_count integer;
BEGIN
  IF public.get_my_role() <> 'administrator' THEN
    RETURN jsonb_build_object('error', 'Only administrators can permanently delete records', 'code', 'UNAUTHORIZED');
  END IF;

  SELECT e.name INTO v_name
  FROM public.ecdc_list e
  WHERE e.id = e_id AND e.deleted_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ECDC not found or not soft-deleted', 'code', 'NOT_FOUND');
  END IF;

  SELECT count(*)::integer INTO v_practitioner_count
  FROM public.practitioners p WHERE p.ecdc_id = e_id;

  INSERT INTO public.audit_logs (table_name, record_id, changed_fields, changed_by_id)
  VALUES (
    'ecdc_list', e_id,
    jsonb_build_object(
      'action', jsonb_build_object('old', null, 'new', 'HARD_DELETE'),
      'deleted_record_name', jsonb_build_object('old', v_name, 'new', null),
      'practitioners_unassigned', jsonb_build_object('old', v_practitioner_count, 'new', 0)
    ),
    auth.uid()
  );

  DELETE FROM public.ecdc_list WHERE id = e_id;

  RETURN jsonb_build_object(
    'success', true, 'message', 'ECDC permanently deleted', 'name', v_name,
    'practitioners_unassigned', v_practitioner_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hard_delete_outreach_visit(v_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_date date;
BEGIN
  IF public.get_my_role() <> 'administrator' THEN
    RETURN jsonb_build_object('error', 'Only administrators can permanently delete records', 'code', 'UNAUTHORIZED');
  END IF;

  SELECT v.date INTO v_date
  FROM public.outreach_visits v
  WHERE v.id = v_id AND v.deleted_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Outreach visit not found or not soft-deleted', 'code', 'NOT_FOUND');
  END IF;

  INSERT INTO public.audit_logs (table_name, record_id, changed_fields, changed_by_id)
  VALUES (
    'outreach_visits', v_id,
    jsonb_build_object(
      'action', jsonb_build_object('old', null, 'new', 'HARD_DELETE'),
      'deleted_record_date', jsonb_build_object('old', v_date, 'new', null)
    ),
    auth.uid()
  );

  DELETE FROM public.outreach_visits WHERE id = v_id;

  RETURN jsonb_build_object('success', true, 'message', 'Outreach visit permanently deleted', 'date', v_date);
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_practitioner(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_name text;
BEGIN
  IF public.get_my_role() <> 'administrator' THEN
    RETURN jsonb_build_object('error', 'Only administrators can restore practitioners', 'code', 'UNAUTHORIZED');
  END IF;
  SELECT p.name INTO v_name FROM public.practitioners p
  WHERE p.id = p_id AND p.deleted_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Practitioner not found or not deleted', 'code', 'NOT_FOUND');
  END IF;
  UPDATE public.practitioners SET deleted_at = NULL WHERE id = p_id;
  INSERT INTO public.audit_logs (table_name, record_id, changed_fields, changed_by_id)
  VALUES ('practitioners', p_id, jsonb_build_object(
    'action', jsonb_build_object('old', 'SOFT_DELETE', 'new', 'RESTORE'),
    'record_name', jsonb_build_object('old', v_name, 'new', v_name)
  ), auth.uid());
  RETURN jsonb_build_object('success', true, 'message', 'Practitioner restored', 'name', v_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_ecdc(e_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_name text;
BEGIN
  IF public.get_my_role() <> 'administrator' THEN
    RETURN jsonb_build_object('error', 'Only administrators can restore ECDCs', 'code', 'UNAUTHORIZED');
  END IF;
  SELECT e.name INTO v_name FROM public.ecdc_list e
  WHERE e.id = e_id AND e.deleted_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ECDC not found or not deleted', 'code', 'NOT_FOUND');
  END IF;
  UPDATE public.ecdc_list SET deleted_at = NULL WHERE id = e_id;
  INSERT INTO public.audit_logs (table_name, record_id, changed_fields, changed_by_id)
  VALUES ('ecdc_list', e_id, jsonb_build_object(
    'action', jsonb_build_object('old', 'SOFT_DELETE', 'new', 'RESTORE'),
    'record_name', jsonb_build_object('old', v_name, 'new', v_name)
  ), auth.uid());
  RETURN jsonb_build_object('success', true, 'message', 'ECDC restored', 'name', v_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_outreach_visit(v_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_date date;
BEGIN
  IF public.get_my_role() <> 'administrator' THEN
    RETURN jsonb_build_object('error', 'Only administrators can restore visits', 'code', 'UNAUTHORIZED');
  END IF;
  SELECT v.date INTO v_date FROM public.outreach_visits v
  WHERE v.id = v_id AND v.deleted_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Outreach visit not found or not deleted', 'code', 'NOT_FOUND');
  END IF;
  UPDATE public.outreach_visits SET deleted_at = NULL WHERE id = v_id;
  INSERT INTO public.audit_logs (table_name, record_id, changed_fields, changed_by_id)
  VALUES ('outreach_visits', v_id, jsonb_build_object(
    'action', jsonb_build_object('old', 'SOFT_DELETE', 'new', 'RESTORE'),
    'record_date', jsonb_build_object('old', v_date, 'new', v_date)
  ), auth.uid());
  RETURN jsonb_build_object('success', true, 'message', 'Outreach visit restored', 'date', v_date);
END;
$$;

-- Deleted-record list functions keep the signatures consumed by the frontend.
CREATE OR REPLACE FUNCTION public.get_deleted_practitioners()
RETURNS TABLE(
  id uuid, created_at timestamptz, name text, contact_number1 text, contact_number2 text,
  ecdc_id uuid, updated_at timestamptz, group_id uuid, dsd_funded boolean,
  dsd_registered boolean, has_whatsapp boolean, "group" text, status text, deleted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.created_at, p.name, p.contact_number1, p.contact_number2,
         p.ecdc_id, p.updated_at, p.group_id, p.dsd_funded, p.dsd_registered,
         p.has_whatsapp, p."group", p.status, p.deleted_at
  FROM public.practitioners p
  WHERE public.get_my_role() = 'administrator' AND p.deleted_at IS NOT NULL
  ORDER BY p.deleted_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_deleted_ecdcs()
RETURNS TABLE(
  id uuid, created_at timestamptz, name text, area text, longitude double precision,
  latitude double precision, area_id uuid, chief text, headman text,
  number_children text, attendance_updated timestamptz, deleted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT e.id, e.created_at, e.name, e.area, e.longitude, e.latitude, e.area_id,
         e.chief, e.headman, e.number_children, e.attendance_updated, e.deleted_at
  FROM public.ecdc_list e
  WHERE public.get_my_role() = 'administrator' AND e.deleted_at IS NOT NULL
  ORDER BY e.deleted_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_deleted_outreach_visits()
RETURNS TABLE(
  id uuid, created_at timestamptz, date date, practitioner_id uuid, outreach_type text,
  transport_type text, transport_cost numeric, transport_km numeric, parents_trained numeric,
  children_books numeric, books_per_child numeric, books_to_practitioner numeric,
  data_capturer_id uuid, photos_taken boolean, comments text, outreach_happened text,
  did_instead text, parents_enrolled numeric, kobo_instance_id text, source text,
  people_reached numeric, deleted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT v.id, v.created_at, v.date, v.practitioner_id, v.outreach_type,
         v.transport_type, v.transport_cost, v.transport_km, v.parents_trained,
         v.children_books, v.books_per_child, v.books_to_practitioner,
         v.data_capturer_id, v.photos_taken, v.comments, v.outreach_happened,
         v.did_instead, v.parents_enrolled, v.kobo_instance_id, v.source,
         v.people_reached, v.deleted_at
  FROM public.outreach_visits v
  WHERE public.get_my_role() = 'administrator' AND v.deleted_at IS NOT NULL
  ORDER BY v.deleted_at DESC;
$$;

-- ---------------------------------------------------------------------------
-- Unmatched resolution and external-ID lookup
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_unmatched_submission(
  p_unmatched_id uuid,
  p_resolved_id uuid DEFAULT NULL,
  p_resolution_type text DEFAULT 'link',
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unmatched public.kobo_unmatched%ROWTYPE;
  v_target_exists boolean;
BEGIN
  IF public.get_my_role() <> ALL (ARRAY['administrator', 'manager']) THEN
    RETURN jsonb_build_object('error', 'Only administrators and managers can resolve unmatched records', 'code', 'UNAUTHORIZED');
  END IF;

  SELECT * INTO v_unmatched
  FROM public.kobo_unmatched ku
  WHERE ku.id = p_unmatched_id AND ku.resolved_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Unmatched record not found or already resolved', 'code', 'NOT_FOUND');
  END IF;

  IF p_resolution_type NOT IN ('link', 'create', 'reviewed', 'ignore') THEN
    RETURN jsonb_build_object('error', 'Unsupported resolution type', 'code', 'INVALID_RESOLUTION_TYPE');
  END IF;

  IF p_resolution_type = 'link' THEN
    IF p_resolved_id IS NULL THEN
      RETURN jsonb_build_object('error', 'A linked resolution requires resolved_id', 'code', 'MISSING_RESOLVED_ID');
    END IF;

    IF pg_catalog.lower(coalesce(v_unmatched.field, '')) LIKE '%ecdc%' THEN
      SELECT EXISTS (SELECT 1 FROM public.ecdc_list e WHERE e.id = p_resolved_id AND e.deleted_at IS NULL)
      INTO v_target_exists;
    ELSIF pg_catalog.lower(coalesce(v_unmatched.field, '')) LIKE '%practitioner%' THEN
      SELECT EXISTS (SELECT 1 FROM public.practitioners p WHERE p.id = p_resolved_id AND p.deleted_at IS NULL)
      INTO v_target_exists;
    ELSE
      SELECT EXISTS (SELECT 1 FROM public.practitioners p WHERE p.id = p_resolved_id AND p.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM public.ecdc_list e WHERE e.id = p_resolved_id AND e.deleted_at IS NULL)
      INTO v_target_exists;
    END IF;

    IF NOT v_target_exists THEN
      RETURN jsonb_build_object('error', 'Resolved target does not exist or is deleted', 'code', 'INVALID_RESOLVED_ID');
    END IF;
  END IF;

  UPDATE public.kobo_unmatched
  SET resolved_id = p_resolved_id,
      resolved_at = now(),
      resolved_by = auth.uid()
  WHERE id = p_unmatched_id;

  INSERT INTO public.audit_logs (table_name, record_id, changed_fields, changed_by_id)
  VALUES (
    'kobo_unmatched', p_unmatched_id,
    jsonb_build_object(
      'action', jsonb_build_object('old', null, 'new', 'RESOLVE_UNMATCHED'),
      'instance_id', jsonb_build_object('old', v_unmatched.instance_id, 'new', v_unmatched.instance_id),
      'field', jsonb_build_object('old', v_unmatched.field, 'new', v_unmatched.field),
      'raw_value', jsonb_build_object('old', v_unmatched.raw_value, 'new', v_unmatched.raw_value),
      'resolved_id', jsonb_build_object('old', null, 'new', p_resolved_id),
      'resolution_type', jsonb_build_object('old', null, 'new', p_resolution_type),
      'note', jsonb_build_object('old', null, 'new', p_note)
    ),
    auth.uid()
  );

  RETURN jsonb_build_object('success', true, 'message', 'Unmatched record resolved', 'id', p_unmatched_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_practitioner_external_id(raw_value text)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.name
  FROM public.practitioners p
  WHERE raw_value IS NOT NULL
    AND p.deleted_at IS NULL
    AND (
      pg_catalog.lower(p.id::text) = pg_catalog.lower(raw_value)
      OR pg_catalog.replace(pg_catalog.lower(p.id::text), '-', '') = pg_catalog.lower(raw_value)
      OR md5(pg_catalog.lower(p.id::text)) = pg_catalog.lower(raw_value)
    )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.resolve_ecdc_external_id(raw_value text)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT e.id, e.name
  FROM public.ecdc_list e
  WHERE raw_value IS NOT NULL
    AND e.deleted_at IS NULL
    AND (
      pg_catalog.lower(e.id::text) = pg_catalog.lower(raw_value)
      OR pg_catalog.replace(pg_catalog.lower(e.id::text), '-', '') = pg_catalog.lower(raw_value)
      OR md5(pg_catalog.lower(e.id::text)) = pg_catalog.lower(raw_value)
    )
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- Field-choice merges
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.merge_practitioners(uuid, uuid);
DROP FUNCTION IF EXISTS public.merge_practitioners(uuid, uuid, jsonb);

CREATE FUNCTION public.merge_practitioners(
  keep_id uuid,
  discard_id uuid,
  field_choices jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_keep public.practitioners%ROWTYPE;
  v_discard public.practitioners%ROWTYPE;
  v_visit_count integer := 0;
  v_plan_count integer := 0;
  v_pick text;
BEGIN
  IF public.get_my_role() <> ALL (ARRAY['administrator', 'manager']) THEN
    RETURN jsonb_build_object('error', 'Only administrators and managers can merge practitioners', 'code', 'UNAUTHORIZED');
  END IF;
  IF keep_id = discard_id THEN
    RETURN jsonb_build_object('error', 'Cannot merge a practitioner into itself', 'code', 'INVALID_MERGE');
  END IF;

  SELECT * INTO v_keep FROM public.practitioners p
  WHERE p.id = keep_id AND p.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Practitioner to keep not found', 'code', 'KEEP_NOT_FOUND'); END IF;

  SELECT * INTO v_discard FROM public.practitioners p
  WHERE p.id = discard_id AND p.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Practitioner to merge not found', 'code', 'DISCARD_NOT_FOUND'); END IF;

  UPDATE public.outreach_visits SET practitioner_id = keep_id WHERE practitioner_id = discard_id;
  GET DIAGNOSTICS v_visit_count = ROW_COUNT;

  INSERT INTO public.outreach_visit_practitioners
    (visit_id, practitioner_id, participation_role, was_planned, notes)
  SELECT ovp.visit_id, keep_id,
         CASE WHEN EXISTS (
           SELECT 1 FROM public.outreach_visit_practitioners primary_link
           WHERE primary_link.visit_id = ovp.visit_id
             AND primary_link.participation_role = 'primary'
             AND primary_link.practitioner_id <> discard_id
         ) THEN 'additional' ELSE ovp.participation_role END,
         ovp.was_planned, ovp.notes
  FROM public.outreach_visit_practitioners ovp
  WHERE ovp.practitioner_id = discard_id
  ON CONFLICT (visit_id, practitioner_id) DO UPDATE
    SET was_planned = coalesce(public.outreach_visit_practitioners.was_planned, EXCLUDED.was_planned),
        notes = coalesce(public.outreach_visit_practitioners.notes, EXCLUDED.notes);

  DELETE FROM public.outreach_visit_practitioners WHERE practitioner_id = discard_id;

  UPDATE public.planned_visits
  SET practitioner_id = keep_id, practitioner_name = coalesce(v_keep.name, practitioner_name), updated_at = now()
  WHERE practitioner_id = discard_id;
  GET DIAGNOSTICS v_plan_count = ROW_COUNT;

  v_pick := coalesce(field_choices->>'name', 'keep');
  IF v_pick = 'discard' THEN v_keep.name := v_discard.name; END IF;
  v_pick := coalesce(field_choices->>'contact_number1', 'coalesce');
  IF v_pick = 'discard' THEN v_keep.contact_number1 := v_discard.contact_number1;
  ELSIF v_pick = 'coalesce' THEN v_keep.contact_number1 := coalesce(nullif(v_keep.contact_number1, ''), nullif(v_discard.contact_number1, '')); END IF;
  v_pick := coalesce(field_choices->>'contact_number2', 'coalesce');
  IF v_pick = 'discard' THEN v_keep.contact_number2 := v_discard.contact_number2;
  ELSIF v_pick = 'coalesce' THEN v_keep.contact_number2 := coalesce(nullif(v_keep.contact_number2, ''), nullif(v_discard.contact_number2, '')); END IF;
  v_pick := coalesce(field_choices->>'ecdc_id', 'coalesce');
  IF v_pick = 'discard' THEN v_keep.ecdc_id := v_discard.ecdc_id;
  ELSIF v_pick = 'coalesce' THEN v_keep.ecdc_id := coalesce(v_keep.ecdc_id, v_discard.ecdc_id); END IF;
  v_pick := coalesce(field_choices->>'group_id', 'coalesce');
  IF v_pick = 'discard' THEN v_keep.group_id := v_discard.group_id;
  ELSIF v_pick = 'coalesce' THEN v_keep.group_id := coalesce(v_keep.group_id, v_discard.group_id); END IF;
  v_pick := coalesce(field_choices->>'group', 'coalesce');
  IF v_pick = 'discard' THEN v_keep."group" := v_discard."group";
  ELSIF v_pick = 'coalesce' THEN v_keep."group" := coalesce(nullif(v_keep."group", ''), nullif(v_discard."group", '')); END IF;
  v_pick := coalesce(field_choices->>'has_whatsapp', 'or');
  IF v_pick = 'discard' THEN v_keep.has_whatsapp := v_discard.has_whatsapp;
  ELSIF v_pick = 'or' THEN v_keep.has_whatsapp := coalesce(v_keep.has_whatsapp, false) OR coalesce(v_discard.has_whatsapp, false); END IF;
  v_pick := coalesce(field_choices->>'dsd_registered', 'coalesce');
  IF v_pick = 'discard' THEN v_keep.dsd_registered := v_discard.dsd_registered;
  ELSIF v_pick = 'coalesce' THEN v_keep.dsd_registered := coalesce(v_keep.dsd_registered, v_discard.dsd_registered); END IF;
  v_pick := coalesce(field_choices->>'dsd_funded', 'coalesce');
  IF v_pick = 'discard' THEN v_keep.dsd_funded := v_discard.dsd_funded;
  ELSIF v_pick = 'coalesce' THEN v_keep.dsd_funded := coalesce(v_keep.dsd_funded, v_discard.dsd_funded); END IF;
  v_pick := coalesce(field_choices->>'status', 'keep');
  IF v_pick = 'discard' THEN v_keep.status := v_discard.status; END IF;

  UPDATE public.practitioners
  SET name = v_keep.name, contact_number1 = v_keep.contact_number1,
      contact_number2 = v_keep.contact_number2, ecdc_id = v_keep.ecdc_id,
      group_id = v_keep.group_id, "group" = v_keep."group",
      has_whatsapp = v_keep.has_whatsapp, dsd_registered = v_keep.dsd_registered,
      dsd_funded = v_keep.dsd_funded, status = v_keep.status, updated_at = now()
  WHERE id = keep_id;

  IF EXISTS (SELECT 1 FROM public.training WHERE id = keep_id)
     AND EXISTS (SELECT 1 FROM public.training WHERE id = discard_id) THEN
    UPDATE public.training kt
    SET smart_start_ever = coalesce(kt.smart_start_ever, false) OR coalesce(dt.smart_start_ever, false),
        smart_start_date = coalesce(kt.smart_start_date, dt.smart_start_date),
        first_aid_ever = coalesce(kt.first_aid_ever, false) OR coalesce(dt.first_aid_ever, false),
        first_aid_date = coalesce(kt.first_aid_date, dt.first_aid_date),
        level4_ever = coalesce(kt.level4_ever, false) OR coalesce(dt.level4_ever, false),
        level4_date = coalesce(kt.level4_date, dt.level4_date),
        level5_ever = coalesce(kt.level5_ever, false) OR coalesce(dt.level5_ever, false),
        level5_date = coalesce(kt.level5_date, dt.level5_date),
        wordworks03_ever = coalesce(kt.wordworks03_ever, false) OR coalesce(dt.wordworks03_ever, false),
        wordworks03_date = coalesce(kt.wordworks03_date, dt.wordworks03_date),
        wordworks35_ever = coalesce(kt.wordworks35_ever, false) OR coalesce(dt.wordworks35_ever, false),
        wordworks35_date = coalesce(kt.wordworks35_date, dt.wordworks35_date),
        littlestars_ever = coalesce(kt.littlestars_ever, false) OR coalesce(dt.littlestars_ever, false),
        littlestars_date = coalesce(kt.littlestars_date, dt.littlestars_date),
        other = nullif(pg_catalog.btrim(concat_ws('; ', nullif(kt.other, ''), nullif(dt.other, '')), '; '), ''),
        other_date = coalesce(kt.other_date, dt.other_date)
    FROM public.training dt
    WHERE kt.id = keep_id AND dt.id = discard_id;
    DELETE FROM public.training WHERE id = discard_id;
  ELSIF EXISTS (SELECT 1 FROM public.training WHERE id = discard_id) THEN
    UPDATE public.training SET id = keep_id WHERE id = discard_id;
  END IF;

  INSERT INTO public.training_events
    (practitioner_id, course_code, completed_on, provider, notes, source, created_at, created_by_id)
  SELECT keep_id, te.course_code, te.completed_on, te.provider, te.notes, te.source, te.created_at, te.created_by_id
  FROM public.training_events te WHERE te.practitioner_id = discard_id
  ON CONFLICT (practitioner_id, course_code, completed_on) DO UPDATE
    SET notes = nullif(pg_catalog.btrim(concat_ws('; ', public.training_events.notes, EXCLUDED.notes), '; '), ''),
        provider = coalesce(public.training_events.provider, EXCLUDED.provider);
  DELETE FROM public.training_events WHERE practitioner_id = discard_id;

  UPDATE public.practitioner_lifecycle_events SET practitioner_id = keep_id WHERE practitioner_id = discard_id;
  UPDATE public.practitioner_group_history SET practitioner_id = keep_id WHERE practitioner_id = discard_id AND ended_on IS NOT NULL;

  UPDATE public.practitioners
  SET deleted_at = now(), status = 'inactive', updated_at = now()
  WHERE id = discard_id;

  INSERT INTO public.audit_logs (table_name, record_id, changed_fields, changed_by_id)
  VALUES ('practitioners', keep_id, jsonb_build_object(
    'action', jsonb_build_object('old', null, 'new', 'MERGE_PRACTITIONERS'),
    'discarded_id', jsonb_build_object('old', discard_id, 'new', keep_id),
    'discarded_name', jsonb_build_object('old', v_discard.name, 'new', v_keep.name),
    'visits_moved', jsonb_build_object('old', 0, 'new', v_visit_count),
    'planned_visits_moved', jsonb_build_object('old', 0, 'new', v_plan_count)
  ), auth.uid());

  RETURN jsonb_build_object(
    'success', true, 'message', 'Practitioners merged', 'kept_id', keep_id,
    'kept_name', v_keep.name, 'discarded_id', discard_id,
    'discarded_name', v_discard.name, 'visits_moved', v_visit_count,
    'planned_visits_moved', v_plan_count
  );
END;
$$;

DROP FUNCTION IF EXISTS public.merge_ecdcs(uuid, uuid, jsonb);

CREATE FUNCTION public.merge_ecdcs(
  keep_id uuid,
  discard_id uuid,
  field_choices jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_keep public.ecdc_list%ROWTYPE;
  v_discard public.ecdc_list%ROWTYPE;
  v_practitioner_count integer := 0;
  v_pick text;
BEGIN
  IF public.get_my_role() <> ALL (ARRAY['administrator', 'manager']) THEN
    RETURN jsonb_build_object('error', 'Only administrators and managers can merge ECDCs', 'code', 'UNAUTHORIZED');
  END IF;
  IF keep_id = discard_id THEN
    RETURN jsonb_build_object('error', 'Cannot merge an ECDC into itself', 'code', 'INVALID_MERGE');
  END IF;

  SELECT * INTO v_keep FROM public.ecdc_list e
  WHERE e.id = keep_id AND e.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'ECDC to keep not found', 'code', 'KEEP_NOT_FOUND'); END IF;
  SELECT * INTO v_discard FROM public.ecdc_list e
  WHERE e.id = discard_id AND e.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'ECDC to merge not found', 'code', 'DISCARD_NOT_FOUND'); END IF;

  UPDATE public.practitioners SET ecdc_id = keep_id, updated_at = now() WHERE ecdc_id = discard_id;
  GET DIAGNOSTICS v_practitioner_count = ROW_COUNT;

  v_pick := coalesce(field_choices->>'name', 'keep');
  IF v_pick = 'discard' THEN v_keep.name := v_discard.name; END IF;
  v_pick := coalesce(field_choices->>'area', 'coalesce');
  IF v_pick = 'discard' THEN v_keep.area := v_discard.area;
  ELSIF v_pick = 'coalesce' THEN v_keep.area := coalesce(nullif(v_keep.area, ''), nullif(v_discard.area, '')); END IF;
  v_pick := coalesce(field_choices->>'longitude', 'coalesce');
  IF v_pick = 'discard' THEN v_keep.longitude := v_discard.longitude;
  ELSIF v_pick = 'coalesce' THEN v_keep.longitude := coalesce(v_keep.longitude, v_discard.longitude); END IF;
  v_pick := coalesce(field_choices->>'latitude', 'coalesce');
  IF v_pick = 'discard' THEN v_keep.latitude := v_discard.latitude;
  ELSIF v_pick = 'coalesce' THEN v_keep.latitude := coalesce(v_keep.latitude, v_discard.latitude); END IF;
  v_pick := coalesce(field_choices->>'area_id', 'coalesce');
  IF v_pick = 'discard' THEN v_keep.area_id := v_discard.area_id;
  ELSIF v_pick = 'coalesce' THEN v_keep.area_id := coalesce(v_keep.area_id, v_discard.area_id); END IF;
  v_pick := coalesce(field_choices->>'chief', 'coalesce');
  IF v_pick = 'discard' THEN v_keep.chief := v_discard.chief; v_keep.chief_id := v_discard.chief_id;
  ELSIF v_pick = 'coalesce' THEN v_keep.chief := coalesce(nullif(v_keep.chief, ''), nullif(v_discard.chief, '')); v_keep.chief_id := coalesce(v_keep.chief_id, v_discard.chief_id); END IF;
  v_pick := coalesce(field_choices->>'headman', 'coalesce');
  IF v_pick = 'discard' THEN v_keep.headman := v_discard.headman; v_keep.headman_id := v_discard.headman_id;
  ELSIF v_pick = 'coalesce' THEN v_keep.headman := coalesce(nullif(v_keep.headman, ''), nullif(v_discard.headman, '')); v_keep.headman_id := coalesce(v_keep.headman_id, v_discard.headman_id); END IF;
  v_pick := coalesce(field_choices->>'number_children', 'coalesce');
  IF v_pick = 'discard' THEN v_keep.number_children := v_discard.number_children;
  ELSIF v_pick = 'coalesce' THEN v_keep.number_children := coalesce(nullif(v_keep.number_children, ''), nullif(v_discard.number_children, '')); END IF;

  UPDATE public.ecdc_list
  SET name = v_keep.name, area = v_keep.area, longitude = v_keep.longitude,
      latitude = v_keep.latitude, area_id = v_keep.area_id,
      chief = v_keep.chief, chief_id = v_keep.chief_id,
      headman = v_keep.headman, headman_id = v_keep.headman_id,
      number_children = v_keep.number_children
  WHERE id = keep_id;

  UPDATE public.ecdc_list SET deleted_at = now() WHERE id = discard_id;

  INSERT INTO public.audit_logs (table_name, record_id, changed_fields, changed_by_id)
  VALUES ('ecdc_list', keep_id, jsonb_build_object(
    'action', jsonb_build_object('old', null, 'new', 'MERGE_ECDCS'),
    'discarded_id', jsonb_build_object('old', discard_id, 'new', keep_id),
    'discarded_name', jsonb_build_object('old', v_discard.name, 'new', v_keep.name),
    'practitioners_moved', jsonb_build_object('old', 0, 'new', v_practitioner_count)
  ), auth.uid());

  RETURN jsonb_build_object(
    'success', true, 'message', 'ECDCs merged', 'kept_id', keep_id,
    'kept_name', v_keep.name, 'discarded_id', discard_id,
    'discarded_name', v_discard.name, 'practitioners_moved', v_practitioner_count
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Data-quality summary
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.data_quality_summary
WITH (security_invoker = true)
AS
SELECT 'unmatched_open'::text metric_key, 'Unmatched Kobo values'::text label,
       count(*)::integer value, 'high'::text severity
FROM public.kobo_unmatched WHERE resolved_at IS NULL
UNION ALL
SELECT 'failed_submissions', 'Failed Kobo submissions', count(*)::integer, 'critical'
FROM public.kobo_processed WHERE status = 'failed'
UNION ALL
SELECT 'partial_submissions', 'Partial Kobo submissions', count(*)::integer, 'high'
FROM public.kobo_processed WHERE status = 'partial'
UNION ALL
SELECT 'visits_without_practitioner', 'Visits without practitioners', count(*)::integer, 'high'
FROM public.outreach_visits v
WHERE v.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.outreach_visit_practitioners ovp WHERE ovp.visit_id = v.id)
UNION ALL
SELECT 'ecdcs_without_coordinates', 'ECDCs without coordinates', count(*)::integer, 'medium'
FROM public.ecdc_list WHERE deleted_at IS NULL AND (latitude IS NULL OR longitude IS NULL)
UNION ALL
SELECT 'practitioners_without_ecdc', 'Practitioners without ECDC', count(*)::integer, 'medium'
FROM public.practitioners WHERE deleted_at IS NULL AND ecdc_id IS NULL
UNION ALL
SELECT 'old_attendance_counts', 'ECDCs with old or missing attendance counts', count(*)::integer, 'medium'
FROM public.ecdc_list
WHERE deleted_at IS NULL AND (attendance_updated IS NULL OR attendance_updated < now() - interval '6 months')
UNION ALL
SELECT 'missing_contact_numbers', 'Practitioners without contact numbers', count(*)::integer, 'medium'
FROM public.practitioners
WHERE deleted_at IS NULL AND nullif(pg_catalog.btrim(coalesce(contact_number1, '') || coalesce(contact_number2, '')), '') IS NULL
UNION ALL
SELECT 'unlinked_staff_profiles', 'Profiles not linked to staff records', count(*)::integer, 'medium'
FROM public.profiles WHERE role IN ('administrator', 'manager', 'datacapturer') AND layita_staff_id IS NULL
UNION ALL
SELECT 'leader_names_to_review', 'Chief/headman names awaiting normalization', count(*)::integer, 'low'
FROM public.traditional_leaders WHERE needs_review;

-- ---------------------------------------------------------------------------
-- RLS and role capability alignment
-- ---------------------------------------------------------------------------

ALTER TABLE public.correction_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practitioner_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practitioner_group_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_visit_practitioners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traditional_leaders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traditional_leader_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "correction_requests: read own or reviewer"
ON public.correction_requests FOR SELECT TO authenticated
USING (created_by_id = auth.uid() OR public.get_my_role() IN ('administrator', 'manager'));
CREATE POLICY "correction_requests: create own"
ON public.correction_requests FOR INSERT TO authenticated
WITH CHECK (created_by_id = auth.uid() AND status = 'open' AND resolved_at IS NULL AND resolved_by_id IS NULL);
CREATE POLICY "correction_requests: reviewer update"
ON public.correction_requests FOR UPDATE TO authenticated
USING (public.get_my_role() IN ('administrator', 'manager'))
WITH CHECK (public.get_my_role() IN ('administrator', 'manager'));

CREATE POLICY "training_courses: authenticated read"
ON public.training_courses FOR SELECT TO authenticated USING (true);
CREATE POLICY "training_courses: admin manager write"
ON public.training_courses FOR ALL TO authenticated
USING (public.get_my_role() IN ('administrator', 'manager'))
WITH CHECK (public.get_my_role() IN ('administrator', 'manager'));
CREATE POLICY "training_events: authenticated read"
ON public.training_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "training_events: admin manager write"
ON public.training_events FOR ALL TO authenticated
USING (public.get_my_role() IN ('administrator', 'manager'))
WITH CHECK (public.get_my_role() IN ('administrator', 'manager'));

CREATE POLICY "practitioner_lifecycle: reviewer read"
ON public.practitioner_lifecycle_events FOR SELECT TO authenticated
USING (public.get_my_role() IN ('administrator', 'manager'));
CREATE POLICY "practitioner_lifecycle: reviewer write"
ON public.practitioner_lifecycle_events FOR ALL TO authenticated
USING (public.get_my_role() IN ('administrator', 'manager'))
WITH CHECK (public.get_my_role() IN ('administrator', 'manager'));
CREATE POLICY "practitioner_group_history: reviewer read"
ON public.practitioner_group_history FOR SELECT TO authenticated
USING (public.get_my_role() IN ('administrator', 'manager'));
CREATE POLICY "practitioner_group_history: reviewer write"
ON public.practitioner_group_history FOR ALL TO authenticated
USING (public.get_my_role() IN ('administrator', 'manager'))
WITH CHECK (public.get_my_role() IN ('administrator', 'manager'));

CREATE POLICY "visit_practitioners: authenticated read active"
ON public.outreach_visit_practitioners FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.outreach_visits v
  WHERE v.id = visit_id AND v.deleted_at IS NULL
));
CREATE POLICY "visit_practitioners: admin manager write"
ON public.outreach_visit_practitioners FOR ALL TO authenticated
USING (public.get_my_role() IN ('administrator', 'manager'))
WITH CHECK (public.get_my_role() IN ('administrator', 'manager'));
CREATE POLICY "visit_practitioners: datacapturer write own"
ON public.outreach_visit_practitioners FOR ALL TO authenticated
USING (
  public.get_my_role() = 'datacapturer'
  AND EXISTS (
    SELECT 1 FROM public.outreach_visits v
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE v.id = visit_id AND v.data_capturer_id = p.layita_staff_id
      AND v.source <> 'kobo' AND v.deleted_at IS NULL
  )
)
WITH CHECK (
  public.get_my_role() = 'datacapturer'
  AND EXISTS (
    SELECT 1 FROM public.outreach_visits v
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE v.id = visit_id AND v.data_capturer_id = p.layita_staff_id
      AND v.source <> 'kobo' AND v.deleted_at IS NULL
  )
);

CREATE POLICY "traditional_leaders: authenticated read"
ON public.traditional_leaders FOR SELECT TO authenticated USING (true);
CREATE POLICY "traditional_leaders: reviewer write"
ON public.traditional_leaders FOR ALL TO authenticated
USING (public.get_my_role() IN ('administrator', 'manager'))
WITH CHECK (public.get_my_role() IN ('administrator', 'manager'));
CREATE POLICY "traditional_leader_aliases: authenticated read"
ON public.traditional_leader_aliases FOR SELECT TO authenticated USING (true);
CREATE POLICY "traditional_leader_aliases: reviewer write"
ON public.traditional_leader_aliases FOR ALL TO authenticated
USING (public.get_my_role() IN ('administrator', 'manager'))
WITH CHECK (public.get_my_role() IN ('administrator', 'manager'));

-- Replace fragile name-based ownership with the explicit profile/staff FK.
DROP POLICY IF EXISTS "outreach_visits: datacapturer insert" ON public.outreach_visits;
DROP POLICY IF EXISTS "outreach_visits: datacapturer update own" ON public.outreach_visits;
CREATE POLICY "outreach_visits: datacapturer insert"
ON public.outreach_visits FOR INSERT TO authenticated
WITH CHECK (
  public.get_my_role() = 'datacapturer'
  AND data_capturer_id = (SELECT p.layita_staff_id FROM public.profiles p WHERE p.id = auth.uid())
  AND source <> 'kobo'
);
CREATE POLICY "outreach_visits: datacapturer update own"
ON public.outreach_visits FOR UPDATE TO authenticated
USING (
  public.get_my_role() = 'datacapturer'
  AND data_capturer_id = (SELECT p.layita_staff_id FROM public.profiles p WHERE p.id = auth.uid())
  AND source <> 'kobo' AND deleted_at IS NULL
)
WITH CHECK (
  public.get_my_role() = 'datacapturer'
  AND data_capturer_id = (SELECT p.layita_staff_id FROM public.profiles p WHERE p.id = auth.uid())
  AND source <> 'kobo' AND deleted_at IS NULL
);

-- Managers can use the quality/audit routes that their RPC permissions support.
DROP POLICY IF EXISTS "kobo_raw_submissions: administrator read" ON public.kobo_raw_submissions;
CREATE POLICY "kobo_raw_submissions: admin manager read"
ON public.kobo_raw_submissions FOR SELECT TO authenticated
USING (public.get_my_role() IN ('administrator', 'manager'));

-- ---------------------------------------------------------------------------
-- Explicit grants; no anonymous operational access
-- ---------------------------------------------------------------------------

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;

GRANT SELECT, INSERT, UPDATE ON public.correction_requests TO authenticated;
GRANT SELECT ON public.training_courses, public.training_events,
  public.practitioner_lifecycle_events, public.practitioner_group_history,
  public.outreach_visit_practitioners, public.traditional_leaders,
  public.traditional_leader_aliases, public.data_quality_summary TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.training_courses, public.training_events,
  public.practitioner_lifecycle_events, public.practitioner_group_history,
  public.outreach_visit_practitioners, public.traditional_leaders,
  public.traditional_leader_aliases TO authenticated;

GRANT ALL PRIVILEGES ON public.correction_requests, public.training_courses,
  public.training_events, public.practitioner_lifecycle_events,
  public.practitioner_group_history, public.outreach_visit_practitioners,
  public.traditional_leaders, public.traditional_leader_aliases TO service_role;
GRANT SELECT ON public.data_quality_summary TO service_role;

REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_practitioner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_ecdc(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_outreach_visit(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hard_delete_practitioner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hard_delete_ecdc(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hard_delete_outreach_visit(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_practitioner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_ecdc(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_outreach_visit(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_deleted_practitioners() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_deleted_ecdcs() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_deleted_outreach_visits() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_unmatched_submission(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_practitioner_external_id(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_ecdc_external_id(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.merge_practitioners(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.merge_ecdcs(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.find_similar_practitioners(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_dashboard_views() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_table_updates() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_attendance_updated() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_practitioner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_ecdc(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_outreach_visit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hard_delete_practitioner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hard_delete_ecdc(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hard_delete_outreach_visit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_practitioner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_ecdc(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_outreach_visit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_deleted_practitioners() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_deleted_ecdcs() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_deleted_outreach_visits() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_unmatched_submission(uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_practitioner_external_id(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_ecdc_external_id(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_practitioners(uuid, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_ecdcs(uuid, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_similar_practitioners(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_dashboard_views() TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
