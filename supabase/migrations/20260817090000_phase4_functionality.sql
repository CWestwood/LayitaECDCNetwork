-- Phases 4/5: complete the operational workflows requested by test users.
-- Additive and compatibility-first; legacy visit/training columns remain available.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);

-- ---------------------------------------------------------------------------
-- Canonical outreach reporting
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.canonical_outreach_type(value text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT CASE regexp_replace(lower(btrim(coalesce(value, ''))), '[^a-z0-9]+', '_', 'g')
    WHEN 'outreach' THEN 'caregiver_training'
    WHEN 'training' THEN 'caregiver_training'
    WHEN 'caregiver_training' THEN 'caregiver_training'
    WHEN 'caregivertraining' THEN 'caregiver_training'
    WHEN 'literacy' THEN 'literacy_promotion'
    WHEN 'literacy_promotion' THEN 'literacy_promotion'
    WHEN 'support' THEN 'practitioner_support'
    WHEN 'support_visit' THEN 'practitioner_support'
    WHEN 'practitioner_support' THEN 'practitioner_support'
    WHEN 'other' THEN 'other'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.canonical_outreach_outcome(happened text, did_instead text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN lower(btrim(coalesce(happened, ''))) IN ('yes', 'true', 'happened', 'completed') THEN 'happened'
    WHEN lower(btrim(coalesce(happened, ''))) IN (
      'else', 'no, but i did something else', 'no but i did something else',
      'different to planned', 'different_to_planned', 'not as planned', 'not_as_planned'
    )
      OR lower(btrim(coalesce(did_instead, ''))) NOT IN ('', 'none', 'no', 'n/a', 'na', 'not applicable', 'not_applicable')
      THEN 'different_to_planned'
    ELSE 'did_not_happen'
  END
$$;

CREATE OR REPLACE VIEW public.outreach_reporting
WITH (security_invoker = true) AS
SELECT
  v.id,
  v.date,
  CASE
    WHEN public.canonical_outreach_outcome(v.outreach_happened, v.did_instead) = 'different_to_planned'
      THEN coalesce(public.canonical_outreach_type(v.did_instead), public.canonical_outreach_type(v.outreach_type))
    ELSE public.canonical_outreach_type(v.outreach_type)
  END AS outreach_type_code,
  public.canonical_outreach_type(v.outreach_type) AS planned_outreach_type_code,
  public.canonical_outreach_outcome(v.outreach_happened, v.did_instead) AS outcome_code,
  v.outreach_happened,
  v.did_instead,
  v.practitioner_id,
  coalesce(participants.practitioner_ids, ARRAY[]::uuid[]) AS practitioner_ids,
  coalesce(participants.practitioner_names, ARRAY[]::text[]) AS practitioner_names,
  coalesce(participants.practitioner_count, 0) AS practitioner_count,
  e.id AS ecdc_id,
  e.name AS ecdc_name,
  e.area AS ecdc_area,
  v.data_capturer_id,
  s.name AS data_capturer_name,
  v.transport_type,
  v.transport_cost,
  v.transport_km,
  v.public_transport_accessible,
  v.parents_enrolled,
  v.parents_attending,
  v.attendance_rate_percent,
  v.children_receiving_books,
  v.books_distributed_to_children,
  v.books_left_with_practitioner,
  v.bookdash_given,
  v.photos_uploaded_to_album,
  v.photo_album_url,
  v.comments,
  v.source,
  v.kobo_instance_id,
  v.created_at
FROM public.outreach_visits v
LEFT JOIN public.practitioners primary_practitioner ON primary_practitioner.id = v.practitioner_id
LEFT JOIN public.ecdc_list e ON e.id = primary_practitioner.ecdc_id
LEFT JOIN public.layita_staff s ON s.id = v.data_capturer_id
LEFT JOIN LATERAL (
  SELECT
    array_agg(p.id ORDER BY ovp.participation_role DESC, p.name) AS practitioner_ids,
    array_agg(coalesce(p.name, 'Unnamed practitioner') ORDER BY ovp.participation_role DESC, p.name) AS practitioner_names,
    count(*)::integer AS practitioner_count
  FROM public.outreach_visit_practitioners ovp
  JOIN public.practitioners p ON p.id = ovp.practitioner_id
  WHERE ovp.visit_id = v.id
) participants ON true
WHERE v.deleted_at IS NULL
  AND v.resolution_status = 'active'
  AND (
    public.canonical_outreach_type(v.outreach_type) IS NOT NULL
    OR (
      public.canonical_outreach_outcome(v.outreach_happened, v.did_instead) = 'different_to_planned'
      AND public.canonical_outreach_type(v.did_instead) IS NOT NULL
    )
  );

GRANT SELECT ON public.outreach_reporting TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Practitioner mapping notes and governed lifecycle actions
-- ---------------------------------------------------------------------------

ALTER TABLE public.practitioners
  ADD COLUMN IF NOT EXISTS mapping_comments text;

UPDATE public.practitioners p
SET mapping_comments = (
  SELECT v.comments
  FROM public.outreach_visits v
  WHERE v.practitioner_id = p.id
    AND lower(coalesce(v.outreach_type, '')) LIKE '%map%'
    AND nullif(btrim(v.comments), '') IS NOT NULL
  ORDER BY v.date DESC NULLS LAST, v.created_at DESC
  LIMIT 1
)
WHERE p.mapping_comments IS NULL
  AND EXISTS (
    SELECT 1 FROM public.outreach_visits v
    WHERE v.practitioner_id = p.id
      AND lower(coalesce(v.outreach_type, '')) LIKE '%map%'
      AND nullif(btrim(v.comments), '') IS NOT NULL
  );

CREATE OR REPLACE FUNCTION public.set_practitioner_lifecycle(
  p_practitioner_id uuid,
  p_status text,
  p_reason text,
  p_comment text DEFAULT NULL,
  p_effective_on date DEFAULT current_date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor uuid := auth.uid(); v_role text; v_event_id uuid; v_name text; v_current_status text;
BEGIN
  v_role := public.get_my_role();
  IF v_role NOT IN ('administrator', 'manager') THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED');
  END IF;
  IF p_status NOT IN ('active', 'inactive', 'interested')
     OR length(btrim(coalesce(p_reason, ''))) < 3 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_REQUEST');
  END IF;

  SELECT name, status INTO v_name, v_current_status FROM public.practitioners
  WHERE id = p_practitioner_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND'); END IF;
  IF v_current_status = p_status THEN RETURN jsonb_build_object('success', false, 'code', 'NO_STATUS_CHANGE'); END IF;

  UPDATE public.practitioners
  SET status = p_status, updated_at = now()
  WHERE id = p_practitioner_id;

  SELECT id INTO v_event_id
  FROM public.practitioner_lifecycle_events
  WHERE practitioner_id = p_practitioner_id AND status = p_status
  ORDER BY changed_at DESC LIMIT 1;

  UPDATE public.practitioner_lifecycle_events
  SET reason = btrim(p_reason), comment = nullif(btrim(coalesce(p_comment, '')), ''),
      effective_on = coalesce(p_effective_on, current_date), changed_by_id = v_actor
  WHERE id = v_event_id;

  INSERT INTO public.audit_logs(table_name, record_id, changed_fields, changed_by_id,
    actor_type, actor_reference, change_reason, source)
  VALUES ('practitioners', p_practitioner_id, jsonb_build_object(
    'lifecycle_status', jsonb_build_object('old', NULL, 'new', p_status),
    'reason', jsonb_build_object('old', NULL, 'new', btrim(p_reason)),
    'comment', jsonb_build_object('old', NULL, 'new', nullif(btrim(coalesce(p_comment, '')), ''))
  ), v_actor, 'user', v_actor::text, btrim(p_reason), 'lifecycle_action');

  RETURN jsonb_build_object('success', true, 'practitioner_id', p_practitioner_id,
    'name', v_name, 'status', p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_practitioner_mapping_comments(
  p_practitioner_id uuid, p_comments text, p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor uuid := auth.uid(); v_role text; v_old text;
BEGIN
  v_role := public.get_my_role();
  IF v_role NOT IN ('administrator', 'manager') THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED');
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 5 THEN
    RETURN jsonb_build_object('success', false, 'code', 'REASON_REQUIRED');
  END IF;
  SELECT mapping_comments INTO v_old FROM public.practitioners
  WHERE id = p_practitioner_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND'); END IF;
  UPDATE public.practitioners SET mapping_comments = nullif(btrim(coalesce(p_comments, '')), ''), updated_at = now()
  WHERE id = p_practitioner_id;
  INSERT INTO public.audit_logs(table_name, record_id, changed_fields, changed_by_id,
    actor_type, actor_reference, change_reason, source)
  VALUES ('practitioners', p_practitioner_id, jsonb_build_object(
    'mapping_comments', jsonb_build_object('old', v_old, 'new', nullif(btrim(coalesce(p_comments, '')), ''))
  ), v_actor, 'user', v_actor::text, btrim(p_reason), 'audited_correction');
  RETURN jsonb_build_object('success', true, 'practitioner_id', p_practitioner_id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_practitioner_lifecycle(uuid,text,text,text,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_practitioner_mapping_comments(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_practitioner_lifecycle(uuid,text,text,text,date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_practitioner_mapping_comments(uuid,text,text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Multi-practitioner visit editing
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_outreach_visit_practitioners(
  p_visit_id uuid, p_practitioner_ids uuid[], p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor uuid := auth.uid(); v_role text; v_id uuid; v_position integer := 0;
BEGIN
  v_role := public.get_my_role();
  IF v_role NOT IN ('administrator', 'manager') THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED');
  END IF;
  IF coalesce(array_length(p_practitioner_ids, 1), 0) = 0
     OR length(btrim(coalesce(p_reason, ''))) < 5 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_REQUEST');
  END IF;
  PERFORM 1 FROM public.outreach_visits WHERE id = p_visit_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND'); END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_practitioner_ids) requested(id)
    LEFT JOIN public.practitioners p ON p.id = requested.id AND p.deleted_at IS NULL
    WHERE p.id IS NULL
  ) THEN RETURN jsonb_build_object('success', false, 'code', 'PRACTITIONER_NOT_FOUND'); END IF;

  UPDATE public.outreach_visits SET practitioner_id = p_practitioner_ids[1] WHERE id = p_visit_id;
  DELETE FROM public.outreach_visit_practitioners WHERE visit_id = p_visit_id;
  FOREACH v_id IN ARRAY p_practitioner_ids LOOP
    v_position := v_position + 1;
    INSERT INTO public.outreach_visit_practitioners(visit_id, practitioner_id, participation_role)
    VALUES (p_visit_id, v_id, CASE WHEN v_position = 1 THEN 'primary' ELSE 'additional' END);
  END LOOP;
  INSERT INTO public.audit_logs(table_name, record_id, changed_fields, changed_by_id,
    actor_type, actor_reference, change_reason, source)
  VALUES ('outreach_visits', p_visit_id, jsonb_build_object(
    'practitioner_ids', jsonb_build_object('old', NULL, 'new', to_jsonb(p_practitioner_ids))
  ), v_actor, 'user', v_actor::text, btrim(p_reason), 'audited_correction');
  RETURN jsonb_build_object('success', true, 'visit_id', p_visit_id,
    'practitioner_count', array_length(p_practitioner_ids, 1));
END;
$$;

REVOKE ALL ON FUNCTION public.set_outreach_visit_practitioners(uuid,uuid[],text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_outreach_visit_practitioners(uuid,uuid[],text) TO authenticated, service_role;

-- Extend governed visit correction to all normalized reporting fields.
CREATE OR REPLACE FUNCTION public.correct_outreach_visit(
  p_visit_id uuid,
  p_changes jsonb,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor uuid := auth.uid(); v_role text;
DECLARE v_allowed text[] := ARRAY[
  'date','practitioner_id','outreach_type','outreach_happened','did_instead','comments',
  'parents_enrolled','parents_trained','parents_attending','children_books','books_per_child',
  'books_to_practitioner','children_receiving_books','books_distributed_to_children',
  'books_left_with_practitioner','bookdash_given','photos_uploaded_to_album','photo_album_url',
  'transport_type','transport_cost','transport_km','public_transport_accessible'
];
BEGIN
  v_role := public.get_my_role();
  IF v_role NOT IN ('administrator', 'manager') THEN RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED'); END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 5 OR p_changes = '{}'::jsonb OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_changes) key WHERE NOT (key = ANY(v_allowed))
  ) THEN RETURN jsonb_build_object('success', false, 'code', 'INVALID_REQUEST'); END IF;
  PERFORM 1 FROM public.outreach_visits WHERE id = p_visit_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND'); END IF;
  PERFORM set_config('app.actor_type', 'user', true);
  PERFORM set_config('app.actor_reference', v_actor::text, true);
  PERFORM set_config('app.change_reason', btrim(p_reason), true);
  PERFORM set_config('app.change_source', 'audited_correction', true);
  UPDATE public.outreach_visits SET
    date = CASE WHEN p_changes ? 'date' THEN (p_changes->>'date')::date ELSE date END,
    practitioner_id = CASE WHEN p_changes ? 'practitioner_id' THEN (p_changes->>'practitioner_id')::uuid ELSE practitioner_id END,
    outreach_type = CASE WHEN p_changes ? 'outreach_type' THEN p_changes->>'outreach_type' ELSE outreach_type END,
    outreach_happened = CASE WHEN p_changes ? 'outreach_happened' THEN p_changes->>'outreach_happened' ELSE outreach_happened END,
    did_instead = CASE WHEN p_changes ? 'did_instead' THEN p_changes->>'did_instead' ELSE did_instead END,
    comments = CASE WHEN p_changes ? 'comments' THEN p_changes->>'comments' ELSE comments END,
    parents_enrolled = CASE WHEN p_changes ? 'parents_enrolled' THEN (p_changes->>'parents_enrolled')::numeric ELSE parents_enrolled END,
    parents_trained = CASE WHEN p_changes ? 'parents_trained' THEN (p_changes->>'parents_trained')::numeric ELSE parents_trained END,
    parents_attending = CASE WHEN p_changes ? 'parents_attending' THEN (p_changes->>'parents_attending')::numeric ELSE parents_attending END,
    children_books = CASE WHEN p_changes ? 'children_books' THEN (p_changes->>'children_books')::numeric ELSE children_books END,
    books_per_child = CASE WHEN p_changes ? 'books_per_child' THEN (p_changes->>'books_per_child')::numeric ELSE books_per_child END,
    books_to_practitioner = CASE WHEN p_changes ? 'books_to_practitioner' THEN (p_changes->>'books_to_practitioner')::numeric ELSE books_to_practitioner END,
    children_receiving_books = CASE WHEN p_changes ? 'children_receiving_books' THEN (p_changes->>'children_receiving_books')::numeric ELSE children_receiving_books END,
    books_distributed_to_children = CASE WHEN p_changes ? 'books_distributed_to_children' THEN (p_changes->>'books_distributed_to_children')::numeric ELSE books_distributed_to_children END,
    books_left_with_practitioner = CASE WHEN p_changes ? 'books_left_with_practitioner' THEN (p_changes->>'books_left_with_practitioner')::numeric ELSE books_left_with_practitioner END,
    bookdash_given = CASE WHEN p_changes ? 'bookdash_given' THEN (p_changes->>'bookdash_given')::boolean ELSE bookdash_given END,
    photos_uploaded_to_album = CASE WHEN p_changes ? 'photos_uploaded_to_album' THEN (p_changes->>'photos_uploaded_to_album')::boolean ELSE photos_uploaded_to_album END,
    photo_album_url = CASE WHEN p_changes ? 'photo_album_url' THEN p_changes->>'photo_album_url' ELSE photo_album_url END,
    public_transport_accessible = CASE WHEN p_changes ? 'public_transport_accessible' THEN (p_changes->>'public_transport_accessible')::boolean ELSE public_transport_accessible END,
    transport_type = CASE WHEN p_changes ? 'transport_type' THEN p_changes->>'transport_type' ELSE transport_type END,
    transport_cost = CASE WHEN p_changes ? 'transport_cost' THEN (p_changes->>'transport_cost')::numeric ELSE transport_cost END,
    transport_km = CASE WHEN p_changes ? 'transport_km' THEN (p_changes->>'transport_km')::numeric ELSE transport_km END,
    source = 'manual_edit'
  WHERE id = p_visit_id;
  RETURN jsonb_build_object('success', true, 'visit_id', p_visit_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Planning lifecycle and optional day routes
-- ---------------------------------------------------------------------------

ALTER TABLE public.planned_visits
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS completed_visit_id uuid REFERENCES public.outreach_visits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_id uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.planned_visits
SET status = CASE lower(btrim(status))
  WHEN 'complete' THEN 'completed'
  WHEN 'done' THEN 'completed'
  WHEN 'cancelled' THEN 'cancelled'
  WHEN 'canceled' THEN 'cancelled'
  ELSE 'planned' END
WHERE status NOT IN ('planned', 'completed', 'cancelled');

ALTER TABLE public.planned_visits DROP CONSTRAINT IF EXISTS planned_visits_status_check;
ALTER TABLE public.planned_visits ADD CONSTRAINT planned_visits_status_check
  CHECK (status IN ('planned', 'completed', 'cancelled'));

CREATE OR REPLACE FUNCTION public.manage_planned_visit(
  p_plan_id uuid,
  p_status text DEFAULT NULL,
  p_scheduled_date date DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_update_assignee boolean DEFAULT false,
  p_outreach_type text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_completed_visit_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_role text := public.get_my_role(); v_actor uuid := auth.uid();
BEGIN
  IF v_role <> 'administrator' THEN RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED'); END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('planned', 'completed', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_STATUS');
  END IF;
  IF p_status = 'cancelled' AND length(btrim(coalesce(p_reason, ''))) < 3 THEN
    RETURN jsonb_build_object('success', false, 'code', 'REASON_REQUIRED');
  END IF;
  UPDATE public.planned_visits SET
    status = coalesce(p_status, status),
    scheduled_date = coalesce(p_scheduled_date, scheduled_date),
    assigned_to = CASE WHEN p_update_assignee THEN p_assigned_to ELSE assigned_to END,
    outreach_type = coalesce(p_outreach_type, outreach_type),
    notes = coalesce(p_notes, notes),
    cancellation_reason = CASE WHEN p_status = 'cancelled' THEN btrim(p_reason) ELSE cancellation_reason END,
    completed_visit_id = coalesce(p_completed_visit_id, completed_visit_id),
    updated_at = now()
  WHERE id = p_plan_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND'); END IF;
  INSERT INTO public.audit_logs(table_name, record_id, changed_fields, changed_by_id,
    actor_type, actor_reference, change_reason, source)
  VALUES ('planned_visits', p_plan_id, jsonb_build_object(
    'status', jsonb_build_object('old', NULL, 'new', p_status),
    'scheduled_date', jsonb_build_object('old', NULL, 'new', p_scheduled_date),
    'assigned_to', jsonb_build_object('old', NULL, 'new', p_assigned_to)
  ), v_actor, 'user', v_actor::text, coalesce(nullif(btrim(p_reason), ''), 'Planned visit updated'), 'planning');
  RETURN jsonb_build_object('success', true, 'plan_id', p_plan_id);
END;
$$;

CREATE TABLE public.outreach_day_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_date date NOT NULL,
  name text NOT NULL,
  assigned_to uuid REFERENCES public.layita_staff(id) ON DELETE SET NULL,
  cost_per_km numeric NOT NULL DEFAULT 0 CHECK (cost_per_km >= 0),
  estimated_distance_km numeric CHECK (estimated_distance_km IS NULL OR estimated_distance_km >= 0),
  estimated_cost numeric GENERATED ALWAYS AS (
    CASE WHEN estimated_distance_km IS NULL THEN NULL ELSE round(estimated_distance_km * cost_per_km, 2) END
  ) STORED,
  estimation_method text NOT NULL DEFAULT 'straight_line' CHECK (estimation_method IN ('straight_line', 'road_route', 'manual')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_id uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE public.outreach_day_route_stops (
  route_id uuid NOT NULL REFERENCES public.outreach_day_routes(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  practitioner_id uuid NOT NULL REFERENCES public.practitioners(id) ON DELETE RESTRICT,
  planned_visit_id uuid REFERENCES public.planned_visits(id) ON DELETE SET NULL,
  latitude numeric,
  longitude numeric,
  coordinate_warning text,
  PRIMARY KEY (route_id, practitioner_id),
  UNIQUE (route_id, position)
);

-- ---------------------------------------------------------------------------
-- Holiday training sessions and attendance
-- ---------------------------------------------------------------------------

CREATE TABLE public.training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_code text NOT NULL REFERENCES public.training_courses(code) ON DELETE RESTRICT,
  title text NOT NULL,
  session_date date NOT NULL,
  venue text,
  facilitator text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'completed', 'cancelled')),
  notes text,
  evidence_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_id uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE public.training_session_attendance (
  session_id uuid NOT NULL REFERENCES public.training_sessions(id) ON DELETE CASCADE,
  practitioner_id uuid NOT NULL REFERENCES public.practitioners(id) ON DELETE RESTRICT,
  attendance_status text NOT NULL DEFAULT 'invited'
    CHECK (attendance_status IN ('invited', 'attended', 'completed', 'absent', 'cancelled')),
  notes text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (session_id, practitioner_id)
);

CREATE OR REPLACE FUNCTION public.sync_completed_training_attendance()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_session public.training_sessions%ROWTYPE;
BEGIN
  IF NEW.attendance_status = 'completed' THEN
    SELECT * INTO v_session FROM public.training_sessions WHERE id = NEW.session_id;
    INSERT INTO public.training_events(practitioner_id, course_code, completed_on, provider, notes, source, created_by_id)
    VALUES (NEW.practitioner_id, v_session.course_code, v_session.session_date,
      v_session.facilitator, NEW.notes, 'manual', coalesce(NEW.recorded_by_id, auth.uid()))
    ON CONFLICT (practitioner_id, course_code, completed_on)
    DO UPDATE SET provider = coalesce(EXCLUDED.provider, public.training_events.provider),
      notes = coalesce(EXCLUDED.notes, public.training_events.notes);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER training_session_attendance_sync_completion
AFTER INSERT OR UPDATE OF attendance_status ON public.training_session_attendance
FOR EACH ROW EXECUTE FUNCTION public.sync_completed_training_attendance();

-- ---------------------------------------------------------------------------
-- Staff lifecycle (Auth operations remain in the admin-users Edge Function)
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.layita_staff
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

-- ---------------------------------------------------------------------------
-- RLS for new operational tables
-- ---------------------------------------------------------------------------

ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_session_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_day_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_day_route_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training sessions: authenticated read" ON public.training_sessions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "training sessions: reviewer write" ON public.training_sessions
  FOR ALL TO authenticated USING (public.get_my_role() IN ('administrator', 'manager'))
  WITH CHECK (public.get_my_role() IN ('administrator', 'manager'));
CREATE POLICY "training attendance: authenticated read" ON public.training_session_attendance
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "training attendance: reviewer write" ON public.training_session_attendance
  FOR ALL TO authenticated USING (public.get_my_role() IN ('administrator', 'manager'))
  WITH CHECK (public.get_my_role() IN ('administrator', 'manager'));
CREATE POLICY "day routes: administrator read" ON public.outreach_day_routes
  FOR SELECT TO authenticated USING (public.get_my_role() = 'administrator');
CREATE POLICY "day routes: administrator write" ON public.outreach_day_routes
  FOR ALL TO authenticated USING (public.get_my_role() = 'administrator')
  WITH CHECK (public.get_my_role() = 'administrator');
CREATE POLICY "day route stops: administrator read" ON public.outreach_day_route_stops
  FOR SELECT TO authenticated USING (public.get_my_role() = 'administrator');
CREATE POLICY "day route stops: administrator write" ON public.outreach_day_route_stops
  FOR ALL TO authenticated USING (public.get_my_role() = 'administrator')
  WITH CHECK (public.get_my_role() = 'administrator');

REVOKE ALL ON public.training_sessions, public.training_session_attendance,
  public.outreach_day_routes, public.outreach_day_route_stops FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_sessions,
  public.training_session_attendance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_day_routes,
  public.outreach_day_route_stops TO authenticated;
GRANT ALL ON public.training_sessions, public.training_session_attendance,
  public.outreach_day_routes, public.outreach_day_route_stops TO service_role;

REVOKE ALL ON FUNCTION public.manage_planned_visit(uuid,text,date,uuid,boolean,text,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_planned_visit(uuid,text,date,uuid,boolean,text,text,text,uuid) TO authenticated, service_role;
