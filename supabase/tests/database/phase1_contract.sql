\set ON_ERROR_STOP on

BEGIN;

-- The public-only validation fixture intentionally excludes Auth rows. Add
-- one existing administrator profile as a local-only Auth actor without
-- firing the production new-user trigger.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id)
VALUES ('00000000-0000-4000-8000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;
SET LOCAL session_replication_role = origin;
INSERT INTO public.profiles (id, name, role, email)
VALUES (
  '00000000-0000-4000-8000-000000000001'::uuid,
  'Phase 1 test administrator',
  'administrator',
  'phase1-contract-test@example.invalid'
)
ON CONFLICT (id) DO UPDATE SET role = 'administrator';

INSERT INTO public.area (id, name)
VALUES (
  '00000000-0000-4000-8000-000000000002'::uuid,
  'Phase 1 contract-test area'
)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  v_missing text[];
  v_function record;
  v_options text[];
  v_expected_training bigint;
  v_actual_training bigint;
BEGIN
  SELECT array_agg(required.object_name ORDER BY required.object_name)
  INTO v_missing
  FROM (VALUES
    ('correction_requests'),
    ('data_quality_summary'),
    ('outreach_visit_practitioners'),
    ('practitioner_group_history'),
    ('practitioner_lifecycle_events'),
    ('traditional_leader_aliases'),
    ('traditional_leaders'),
    ('training_courses'),
    ('training_events')
  ) AS required(object_name)
  WHERE to_regclass('public.' || required.object_name) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing Phase 1 relations: %', v_missing;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('soft_delete_practitioner(uuid)'), ('soft_delete_ecdc(uuid)'),
      ('soft_delete_outreach_visit(uuid)'), ('hard_delete_practitioner(uuid)'),
      ('hard_delete_ecdc(uuid)'), ('hard_delete_outreach_visit(uuid)'),
      ('restore_practitioner(uuid)'), ('restore_ecdc(uuid)'),
      ('restore_outreach_visit(uuid)'), ('get_deleted_practitioners()'),
      ('get_deleted_ecdcs()'), ('get_deleted_outreach_visits()'),
      ('resolve_unmatched_submission(uuid,uuid,text,text)'),
      ('resolve_practitioner_external_id(text)'), ('resolve_ecdc_external_id(text)'),
      ('merge_practitioners(uuid,uuid,jsonb)'), ('merge_ecdcs(uuid,uuid,jsonb)')
    ) AS required(signature)
    WHERE to_regprocedure('public.' || required.signature) IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more required Phase 1 RPC signatures are missing';
  END IF;

  FOR v_function IN
    SELECT p.oid::regprocedure AS signature, p.proconfig
    FROM pg_proc p
    WHERE p.oid = ANY (ARRAY[
      'public.soft_delete_practitioner(uuid)'::regprocedure,
      'public.soft_delete_ecdc(uuid)'::regprocedure,
      'public.soft_delete_outreach_visit(uuid)'::regprocedure,
      'public.hard_delete_practitioner(uuid)'::regprocedure,
      'public.hard_delete_ecdc(uuid)'::regprocedure,
      'public.hard_delete_outreach_visit(uuid)'::regprocedure,
      'public.restore_practitioner(uuid)'::regprocedure,
      'public.restore_ecdc(uuid)'::regprocedure,
      'public.restore_outreach_visit(uuid)'::regprocedure,
      'public.resolve_unmatched_submission(uuid,uuid,text,text)'::regprocedure,
      'public.merge_practitioners(uuid,uuid,jsonb)'::regprocedure,
      'public.merge_ecdcs(uuid,uuid,jsonb)'::regprocedure
    ])
  LOOP
    v_options := v_function.proconfig;
    IF v_options IS NULL OR NOT EXISTS (
      SELECT 1 FROM unnest(v_options) option_value
      WHERE option_value = 'search_path=public, pg_temp'
    ) THEN
      RAISE EXCEPTION 'Sensitive function % has no fixed search_path', v_function.signature;
    END IF;
  END LOOP;

  IF has_table_privilege('anon', 'public.planned_visits', 'SELECT')
     OR has_table_privilege('anon', 'public.outreach_visits', 'SELECT')
     OR has_table_privilege('anon', 'public.correction_requests', 'SELECT') THEN
    RAISE EXCEPTION 'Anonymous operational table access remains';
  END IF;

  IF has_function_privilege('anon', 'public.soft_delete_practitioner(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.merge_practitioners(uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.resolve_unmatched_submission(uuid,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.find_similar_practitioners(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Inappropriate sensitive RPC execution remains';
  END IF;

  IF EXISTS (SELECT 1 FROM public.practitioners WHERE status IS NULL) THEN
    RAISE EXCEPTION 'Practitioner status normalization left null values';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.outreach_visits v
    WHERE v.practitioner_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.outreach_visit_practitioners ovp
        WHERE ovp.visit_id = v.id
          AND ovp.practitioner_id = v.practitioner_id
          AND ovp.participation_role = 'primary'
      )
  ) THEN
    RAISE EXCEPTION 'Legacy primary practitioner links were not backfilled';
  END IF;

  IF EXISTS (
    SELECT visit_id FROM public.outreach_visit_practitioners
    WHERE participation_role = 'primary'
    GROUP BY visit_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'A visit has more than one primary practitioner';
  END IF;

  SELECT count(*) INTO v_expected_training
  FROM public.training t
  CROSS JOIN LATERAL (
    VALUES
      (coalesce(t.smart_start_ever, false)), (coalesce(t.first_aid_ever, false)),
      (coalesce(t.level4_ever, false)), (coalesce(t.level5_ever, false)),
      (coalesce(t.wordworks03_ever, false)), (coalesce(t.wordworks35_ever, false)),
      (coalesce(t.littlestars_ever, false)),
      (nullif(pg_catalog.btrim(t.other), '') IS NOT NULL)
  ) AS flags(attended)
  WHERE flags.attended;

  SELECT count(*) INTO v_actual_training
  FROM public.training_events WHERE source = 'legacy';

  IF v_actual_training <> v_expected_training THEN
    RAISE EXCEPTION 'Training backfill mismatch: expected %, found %', v_expected_training, v_actual_training;
  END IF;

  IF (SELECT count(*) FROM public.practitioner_lifecycle_events WHERE source = 'baseline')
     <> (SELECT count(*) FROM public.practitioners) THEN
    RAISE EXCEPTION 'Lifecycle baseline does not cover every practitioner';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ecdc_list
    WHERE nullif(pg_catalog.btrim(chief), '') IS NOT NULL AND chief_id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.ecdc_list
    WHERE nullif(pg_catalog.btrim(headman), '') IS NOT NULL AND headman_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Leader aliases were not linked to all populated ECDC values';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.outreach_visits
    WHERE parents_attending IS DISTINCT FROM parents_trained
       OR children_receiving_books IS DISTINCT FROM children_books
       OR books_left_with_practitioner IS DISTINCT FROM books_to_practitioner
  ) THEN
    RAISE EXCEPTION 'Explicit outreach metrics do not match legacy compatibility fields';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid = 'public.data_quality_summary'::regclass
      AND 'security_invoker=true' = ANY (coalesce(c.reloptions, ARRAY[]::text[]))
  ) THEN
    RAISE EXCEPTION 'data_quality_summary is not a security-invoker view';
  END IF;
END;
$$;

DO $$
DECLARE
  v_actor uuid;
  v_practitioner uuid := gen_random_uuid();
  v_ecdc uuid := gen_random_uuid();
  v_ecdc_practitioner uuid := gen_random_uuid();
  v_visit uuid := gen_random_uuid();
  v_result jsonb;
BEGIN
  v_actor := '00000000-0000-4000-8000-000000000001'::uuid;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Role test requires an administrator profile';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);

  INSERT INTO public.practitioners (id, name, status)
  VALUES (v_practitioner, 'Phase 1 delete test', 'active');

  UPDATE public.profiles SET role = 'datacapturer' WHERE id = v_actor;
  v_result := public.soft_delete_practitioner(v_practitioner);
  IF v_result->>'code' <> 'UNAUTHORIZED' THEN
    RAISE EXCEPTION 'Data capturer was allowed to soft-delete: %', v_result;
  END IF;

  UPDATE public.profiles SET role = 'library' WHERE id = v_actor;
  v_result := public.restore_practitioner(v_practitioner);
  IF v_result->>'code' <> 'UNAUTHORIZED' THEN
    RAISE EXCEPTION 'Library user was allowed to restore: %', v_result;
  END IF;

  UPDATE public.profiles SET role = 'administrator' WHERE id = v_actor;

  v_result := public.soft_delete_practitioner(v_practitioner);
  IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Administrator soft-delete failed: %', v_result;
  END IF;

  UPDATE public.profiles SET role = 'manager' WHERE id = v_actor;
  v_result := public.hard_delete_practitioner(v_practitioner);
  IF v_result->>'code' <> 'UNAUTHORIZED' THEN
    RAISE EXCEPTION 'Manager was allowed to hard-delete: %', v_result;
  END IF;

  UPDATE public.profiles SET role = 'administrator' WHERE id = v_actor;
  v_result := public.restore_practitioner(v_practitioner);
  IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Administrator restore failed: %', v_result;
  END IF;

  INSERT INTO public.outreach_visits (id, practitioner_id, source)
  VALUES (v_visit, v_practitioner, 'manual');
  PERFORM public.soft_delete_practitioner(v_practitioner);
  v_result := public.hard_delete_practitioner(v_practitioner);
  IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE
     OR EXISTS (SELECT 1 FROM public.practitioners WHERE id = v_practitioner)
     OR NOT EXISTS (
       SELECT 1 FROM public.outreach_visits WHERE id = v_visit AND practitioner_id IS NULL
     ) THEN
    RAISE EXCEPTION 'Administrator practitioner hard-delete did not preserve/unlink visit history: %', v_result;
  END IF;

  INSERT INTO public.ecdc_list (id, name, area_id)
  VALUES (
    v_ecdc,
    'Phase 1 ECDC delete test',
    '00000000-0000-4000-8000-000000000002'::uuid
  );
  INSERT INTO public.practitioners (id, name, status, ecdc_id)
  VALUES (v_ecdc_practitioner, 'Phase 1 ECDC linked practitioner', 'active', v_ecdc);
  v_result := public.soft_delete_ecdc(v_ecdc);
  IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Administrator ECDC soft-delete failed: %', v_result;
  END IF;
  v_result := public.restore_ecdc(v_ecdc);
  IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Administrator ECDC restore failed: %', v_result;
  END IF;
  PERFORM public.soft_delete_ecdc(v_ecdc);
  v_result := public.hard_delete_ecdc(v_ecdc);
  IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE
     OR EXISTS (SELECT 1 FROM public.ecdc_list WHERE id = v_ecdc)
     OR NOT EXISTS (
       SELECT 1 FROM public.practitioners WHERE id = v_ecdc_practitioner AND ecdc_id IS NULL
     ) THEN
    RAISE EXCEPTION 'Administrator ECDC hard-delete did not unlink practitioners: %', v_result;
  END IF;

  v_visit := gen_random_uuid();
  INSERT INTO public.outreach_visits (id, source) VALUES (v_visit, 'manual');
  v_result := public.soft_delete_outreach_visit(v_visit);
  IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Administrator visit soft-delete failed: %', v_result;
  END IF;
  v_result := public.restore_outreach_visit(v_visit);
  IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Administrator visit restore failed: %', v_result;
  END IF;
  PERFORM public.soft_delete_outreach_visit(v_visit);
  v_result := public.hard_delete_outreach_visit(v_visit);
  IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE
     OR EXISTS (SELECT 1 FROM public.outreach_visits WHERE id = v_visit) THEN
    RAISE EXCEPTION 'Administrator visit hard-delete failed: %', v_result;
  END IF;
END;
$$;

DO $$
DECLARE
  v_actor uuid;
  v_keep uuid := gen_random_uuid();
  v_discard uuid := gen_random_uuid();
  v_visit uuid := gen_random_uuid();
  v_result jsonb;
  v_rate numeric;
BEGIN
  v_actor := '00000000-0000-4000-8000-000000000001'::uuid;
  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);

  INSERT INTO public.practitioners (id, name, status)
  VALUES (v_keep, 'Phase 1 merge keep', 'active'),
         (v_discard, 'Phase 1 merge discard', 'active');
  INSERT INTO public.training (id, first_aid_ever, first_aid_date)
  VALUES (v_discard, true, current_date);
  IF NOT EXISTS (
    SELECT 1 FROM public.training_events
    WHERE practitioner_id = v_discard AND course_code = 'first_aid' AND completed_on = current_date
  ) THEN
    RAISE EXCEPTION 'Legacy training trigger did not create a normalized event';
  END IF;

  INSERT INTO public.outreach_visits
    (id, practitioner_id, source, parents_enrolled, parents_trained,
     children_books, books_per_child, books_to_practitioner)
  VALUES (v_visit, v_discard, 'manual', 20, 10, 8, 2, 3);

  SELECT attendance_rate_percent INTO v_rate FROM public.outreach_visits WHERE id = v_visit;
  IF v_rate <> 50 OR NOT EXISTS (
    SELECT 1 FROM public.outreach_visits
    WHERE id = v_visit
      AND parents_attending = 10
      AND children_receiving_books = 8
      AND books_distributed_to_children = 16
      AND books_left_with_practitioner = 3
  ) THEN
    RAISE EXCEPTION 'Outreach metric compatibility trigger produced incorrect values';
  END IF;

  UPDATE public.profiles SET role = 'manager' WHERE id = v_actor;
  v_result := public.merge_practitioners(
    v_keep, v_discard, jsonb_build_object('contact_number1', 'coalesce')
  );

  IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Manager practitioner merge failed: %', v_result;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.outreach_visit_practitioners
    WHERE visit_id = v_visit AND practitioner_id = v_keep AND participation_role = 'primary'
  ) THEN
    RAISE EXCEPTION 'Practitioner merge did not preserve the primary visit link';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.practitioners WHERE id = v_discard AND deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Practitioner merge did not soft-delete the discarded record';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.training_events
    WHERE practitioner_id = v_keep AND course_code = 'first_aid' AND completed_on = current_date
  ) THEN
    RAISE EXCEPTION 'Practitioner merge did not preserve normalized training history';
  END IF;
  UPDATE public.profiles SET role = 'administrator' WHERE id = v_actor;
END;
$$;

DO $$
DECLARE
  v_actor uuid;
  v_keep_ecdc uuid := gen_random_uuid();
  v_discard_ecdc uuid := gen_random_uuid();
  v_practitioner uuid := gen_random_uuid();
  v_unmatched uuid := gen_random_uuid();
  v_instance text;
  v_result jsonb;
BEGIN
  v_actor := '00000000-0000-4000-8000-000000000001'::uuid;
  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);

  INSERT INTO public.ecdc_list (id, name, chief, area_id)
  VALUES (
           v_keep_ecdc,
           'Phase 1 ECDC merge keep',
           'Merge Chief',
           '00000000-0000-4000-8000-000000000002'::uuid
         ),
         (
           v_discard_ecdc,
           'Phase 1 ECDC merge discard',
           'Discard Chief',
           '00000000-0000-4000-8000-000000000002'::uuid
         );
  INSERT INTO public.practitioners (id, name, status, ecdc_id)
  VALUES (v_practitioner, 'Phase 1 ECDC merge practitioner', 'active', v_discard_ecdc);

  UPDATE public.profiles SET role = 'manager' WHERE id = v_actor;
  v_result := public.merge_ecdcs(
    v_keep_ecdc, v_discard_ecdc, jsonb_build_object('chief', 'discard')
  );
  IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE
     OR NOT EXISTS (
       SELECT 1 FROM public.practitioners WHERE id = v_practitioner AND ecdc_id = v_keep_ecdc
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.ecdc_list WHERE id = v_discard_ecdc AND deleted_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'Manager ECDC merge failed: %', v_result;
  END IF;

  SELECT instance_id INTO v_instance FROM public.kobo_raw_submissions ORDER BY instance_id LIMIT 1;
  INSERT INTO public.kobo_unmatched (id, instance_id, field, raw_value)
  VALUES (v_unmatched, v_instance, 'practitioner_id', 'phase-1-test');
  v_result := public.resolve_unmatched_submission(v_unmatched, v_practitioner, 'link', 'contract test');
  IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE
     OR NOT EXISTS (
       SELECT 1 FROM public.kobo_unmatched
       WHERE id = v_unmatched AND resolved_id = v_practitioner AND resolved_by = v_actor
     ) THEN
    RAISE EXCEPTION 'Manager unmatched resolution failed: %', v_result;
  END IF;

  v_unmatched := gen_random_uuid();
  INSERT INTO public.kobo_unmatched (id, instance_id, field, raw_value)
  VALUES (v_unmatched, v_instance, 'practitioner_id', 'phase-1-unauthorized-test');
  UPDATE public.profiles SET role = 'datacapturer' WHERE id = v_actor;
  v_result := public.resolve_unmatched_submission(v_unmatched, v_practitioner, 'link', NULL);
  IF v_result->>'code' <> 'UNAUTHORIZED' THEN
    RAISE EXCEPTION 'Data capturer was allowed to resolve unmatched data: %', v_result;
  END IF;
  UPDATE public.profiles SET role = 'administrator' WHERE id = v_actor;
END;
$$;

DO $$
DECLARE
  v_ecdc uuid := gen_random_uuid();
  v_alias text;
  v_leader uuid;
  v_linked uuid;
BEGIN
  SELECT a.alias, a.leader_id INTO v_alias, v_leader
  FROM public.traditional_leader_aliases a
  WHERE a.leader_type = 'chief'
  ORDER BY a.alias
  LIMIT 1;

  IF v_leader IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.ecdc_list (id, name, chief, area_id)
  VALUES (
    v_ecdc,
    'Phase 1 leader alias test',
    v_alias,
    '00000000-0000-4000-8000-000000000002'::uuid
  )
  RETURNING chief_id INTO v_linked;

  IF v_linked IS DISTINCT FROM v_leader THEN
    RAISE EXCEPTION 'ECDC leader alias trigger did not resolve the canonical chief';
  END IF;
END;
$$;

ROLLBACK;
