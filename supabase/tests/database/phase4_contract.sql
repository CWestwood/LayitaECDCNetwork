\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE v_missing text[];
BEGIN
  SELECT array_agg(name ORDER BY name) INTO v_missing FROM (VALUES
    ('outreach_reporting'), ('outreach_day_routes'), ('outreach_day_route_stops'),
    ('training_sessions'), ('training_session_attendance')
  ) expected(name) WHERE to_regclass('public.' || name) IS NULL;
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'Missing Phase 4 objects: %', v_missing; END IF;
  IF EXISTS (SELECT 1 FROM (VALUES
    ('canonical_outreach_type(text)'), ('canonical_outreach_outcome(text,text)'),
    ('set_practitioner_lifecycle(uuid,text,text,text,date)'),
    ('set_practitioner_mapping_comments(uuid,text,text)'),
    ('set_outreach_visit_practitioners(uuid,uuid[],text)'),
    ('manage_planned_visit(uuid,text,date,uuid,boolean,text,text,text,uuid)')
  ) expected(signature) WHERE to_regprocedure('public.' || signature) IS NULL)
  THEN RAISE EXCEPTION 'One or more Phase 4 RPC signatures are missing'; END IF;
  IF public.canonical_outreach_type('training') <> 'caregiver_training'
     OR public.canonical_outreach_type('Update ECDC Details') IS NOT NULL
     OR public.canonical_outreach_outcome('no', 'not applicable') <> 'did_not_happen'
     OR public.canonical_outreach_outcome('No, but I did something else', 'literacy_promotion') <> 'different_to_planned'
     OR public.canonical_outreach_outcome('else', 'support') <> 'different_to_planned'
  THEN RAISE EXCEPTION 'Canonical outreach mapping contract failed'; END IF;
  IF has_function_privilege('anon', 'public.set_practitioner_lifecycle(uuid,text,text,text,date)', 'EXECUTE')
  THEN RAISE EXCEPTION 'Lifecycle RPC is exposed to anon'; END IF;
END;
$$;

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id) VALUES ('00000000-0000-4000-8000-000000000014'::uuid) ON CONFLICT (id) DO NOTHING;
SET LOCAL session_replication_role = origin;
INSERT INTO public.profiles (id, name, role, email) VALUES
  ('00000000-0000-4000-8000-000000000014'::uuid, 'Phase 4 reviewer', 'administrator', 'phase4@example.invalid')
ON CONFLICT (id) DO UPDATE SET role = 'administrator', is_active = true;

DO $$
DECLARE v_actor uuid := '00000000-0000-4000-8000-000000000014'; v_p1 uuid := gen_random_uuid(); v_p2 uuid := gen_random_uuid(); v_visit uuid := gen_random_uuid(); v_alternative uuid := gen_random_uuid(); v_result jsonb; v_session uuid; v_course text := 'phase4_fixture';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  INSERT INTO public.practitioners(id, name, status) VALUES (v_p1, 'Phase 4 primary', 'active'), (v_p2, 'Phase 4 additional', 'active');
  INSERT INTO public.outreach_visits(id, date, practitioner_id, outreach_type, outreach_happened, source) VALUES (v_visit, current_date, v_p1, 'training', 'Yes', 'manual');
  INSERT INTO public.outreach_visits(id, date, practitioner_id, outreach_type, outreach_happened, did_instead, source)
  VALUES (v_alternative, current_date, v_p1, 'training', 'No, but I did something else', 'literacy_promotion', 'kobo');
  IF NOT EXISTS (SELECT 1 FROM public.outreach_reporting WHERE id=v_alternative AND outreach_type_code='literacy_promotion' AND planned_outreach_type_code='caregiver_training' AND outcome_code='different_to_planned')
  THEN RAISE EXCEPTION 'Alternative outreach reporting classification failed'; END IF;
  v_result := public.correct_outreach_visit(v_visit, '{"parents_trained":4,"children_books":6,"books_to_practitioner":2}'::jsonb, 'Phase 4 legacy edit compatibility');
  IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE OR NOT EXISTS (
    SELECT 1 FROM public.outreach_visits WHERE id=v_visit AND parents_attending=4 AND children_receiving_books=6 AND books_left_with_practitioner=2
  ) THEN RAISE EXCEPTION 'Legacy visit edit fields did not synchronize: %', v_result; END IF;
  v_result := public.set_outreach_visit_practitioners(v_visit, ARRAY[v_p1,v_p2], 'Phase 4 multi-practitioner fixture');
  IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE OR (SELECT practitioner_count FROM public.outreach_reporting WHERE id=v_visit) <> 2
  THEN RAISE EXCEPTION 'Multi-practitioner reporting contract failed: %', v_result; END IF;
  v_result := public.set_practitioner_lifecycle(v_p1, 'inactive', 'Fixture lifecycle change', 'Test history', current_date - 1);
  IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE OR (SELECT status FROM public.practitioners WHERE id=v_p1) <> 'inactive'
     OR NOT EXISTS (SELECT 1 FROM public.practitioner_lifecycle_events WHERE practitioner_id=v_p1 AND reason='Fixture lifecycle change' AND effective_on=current_date-1)
  THEN RAISE EXCEPTION 'Practitioner lifecycle contract failed: %', v_result; END IF;
  INSERT INTO public.training_courses(code, name) VALUES (v_course, 'Phase 4 fixture course') ON CONFLICT (code) DO NOTHING;
  INSERT INTO public.training_sessions(course_code,title,session_date,status,created_by_id) VALUES (v_course,'Phase 4 fixture session',current_date,'completed',v_actor) RETURNING id INTO v_session;
  INSERT INTO public.training_session_attendance(session_id,practitioner_id,attendance_status,recorded_by_id) VALUES (v_session,v_p2,'completed',v_actor);
  IF NOT EXISTS (SELECT 1 FROM public.training_events WHERE practitioner_id=v_p2 AND course_code=v_course AND completed_on=current_date)
  THEN RAISE EXCEPTION 'Completed training attendance did not sync to training history'; END IF;
END;
$$;

ROLLBACK;
