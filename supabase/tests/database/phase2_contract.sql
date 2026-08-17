\set ON_ERROR_STOP on

BEGIN;

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id)
VALUES ('00000000-0000-4000-8000-000000000011'::uuid)
ON CONFLICT (id) DO NOTHING;
SET LOCAL session_replication_role = origin;
INSERT INTO public.profiles (id, name, role, email)
VALUES (
  '00000000-0000-4000-8000-000000000011'::uuid,
  'Phase 2 test reviewer', 'administrator', 'phase2-contract-test@example.invalid'
)
ON CONFLICT (id) DO UPDATE SET role = 'administrator';

DO $$
DECLARE v_missing text[];
BEGIN
  SELECT array_agg(name ORDER BY name) INTO v_missing
  FROM (VALUES
    ('kobo_processing_attempts'), ('kobo_reconciliation'),
    ('kobo_resolution_ledger'), ('outreach_duplicate_candidates'),
    ('outreach_visit_resolutions'), ('outreach_visit_sources')
  ) expected(name)
  WHERE to_regclass('public.' || name) IS NULL;
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'Missing Phase 2 objects: %', v_missing; END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('record_kobo_raw_submission(text,jsonb,text)'),
      ('begin_kobo_processing(text,text,text,text,uuid,boolean)'),
      ('finish_kobo_processing(uuid,text,uuid,text,jsonb,jsonb)'),
      ('record_kobo_unmatched(text,text,text)'),
      ('resolve_duplicate_outreach_visit(uuid,uuid,text,text)'),
      ('correct_outreach_visit(uuid,jsonb,text)')
    ) expected(signature)
    WHERE to_regprocedure('public.' || signature) IS NULL
  ) THEN RAISE EXCEPTION 'One or more Phase 2 RPC signatures are missing'; END IF;

  IF has_function_privilege('anon', 'public.begin_kobo_processing(text,text,text,text,uuid,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.record_kobo_unmatched(text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Internal ingestion RPC is exposed to a client role';
  END IF;
END;
$$;

DO $$
DECLARE
  v_instance uuid := gen_random_uuid();
  v_run uuid;
  v_duplicate_run uuid;
  v_unmatched uuid;
BEGIN
  PERFORM public.record_kobo_raw_submission(v_instance::text, '{"outreach_type":"support"}', 'hash-one');
  PERFORM public.record_kobo_raw_submission(v_instance::text, '{"outreach_type":"support"}', 'hash-two');
  IF NOT EXISTS (
    SELECT 1 FROM public.kobo_raw_submissions
    WHERE instance_id = v_instance::text AND receive_count = 2 AND payload_hash = 'hash-two'
  ) THEN RAISE EXCEPTION 'Raw receipt upsert is not idempotent'; END IF;

  v_run := public.begin_kobo_processing(v_instance::text, 'webhook', 'phase2-contract', 'hash-two', NULL, false);
  IF v_run IS NULL THEN RAISE EXCEPTION 'First processing run was not started'; END IF;
  v_duplicate_run := public.begin_kobo_processing(v_instance::text, 'webhook', 'phase2-contract', 'hash-two', NULL, false);
  IF v_duplicate_run IS NOT NULL THEN RAISE EXCEPTION 'Concurrent processing run was not suppressed'; END IF;
  PERFORM public.finish_kobo_processing(v_run, 'partial', NULL, NULL, '["test warning"]', '{"fixture":true}');
  IF NOT EXISTS (
    SELECT 1 FROM public.kobo_processed
    WHERE instance_id = v_instance::text AND status = 'partial' AND attempt_count = 1
  ) THEN RAISE EXCEPTION 'Terminal processing status was not recorded'; END IF;

  v_unmatched := public.record_kobo_unmatched(v_instance::text, 'ecdc_practitioner', 'unknown');
  PERFORM public.record_kobo_unmatched(v_instance::text, 'ecdc_practitioner', 'unknown');
  IF NOT EXISTS (
    SELECT 1 FROM public.kobo_unmatched
    WHERE id = v_unmatched AND occurrence_count = 2 AND resolved_at IS NULL
  ) THEN RAISE EXCEPTION 'Unmatched logging is not idempotent'; END IF;
END;
$$;

DO $$
DECLARE
  v_actor uuid := '00000000-0000-4000-8000-000000000011'::uuid;
  v_practitioner uuid := gen_random_uuid();
  v_keep uuid := gen_random_uuid();
  v_discard uuid := gen_random_uuid();
  v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  INSERT INTO public.practitioners(id, name, status)
  VALUES (v_practitioner, 'Phase 2 duplicate practitioner', 'active');
  INSERT INTO public.outreach_visits(id, date, practitioner_id, outreach_type, outreach_happened, source)
  VALUES
    (v_keep, current_date, v_practitioner, 'support', 'Yes', 'manual'),
    (v_discard, current_date, v_practitioner, 'support', 'Yes', 'manual');

  IF NOT EXISTS (
    SELECT 1 FROM public.outreach_duplicate_candidates
    WHERE visit_a_id IN (v_keep, v_discard) AND visit_b_id IN (v_keep, v_discard)
  ) THEN RAISE EXCEPTION 'Duplicate candidate view did not identify a matching pair'; END IF;

  v_result := public.correct_outreach_visit(
    v_keep, jsonb_build_object('date', (current_date - 1)::text), 'Fixture date correction'
  );
  IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE
     OR (SELECT date FROM public.outreach_visits WHERE id = v_keep) <> current_date - 1 THEN
    RAISE EXCEPTION 'Audited visit correction failed: %', v_result;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE record_id = v_keep AND change_reason = 'Fixture date correction'
      AND source = 'audited_correction' AND actor_type = 'user'
  ) THEN RAISE EXCEPTION 'Visit correction reason/provenance was not audited'; END IF;

  -- Align dates again so the duplicate resolution fixture remains realistic.
  PERFORM public.correct_outreach_visit(
    v_keep, jsonb_build_object('date', current_date::text), 'Fixture duplicate alignment'
  );
  v_result := public.resolve_duplicate_outreach_visit(
    v_keep, v_discard, 'Fixture duplicate submission', 'merge'
  );
  IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE
     OR NOT EXISTS (
       SELECT 1 FROM public.outreach_visits
       WHERE id = v_discard AND resolution_status = 'superseded'
         AND superseded_by_id = v_keep AND deleted_at IS NOT NULL
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.outreach_visit_resolutions
       WHERE discarded_visit_id = v_discard AND kept_visit_id = v_keep
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.audit_logs
       WHERE record_id = v_discard AND change_reason = 'Fixture duplicate submission'
         AND source = 'duplicate_resolution'
     ) THEN RAISE EXCEPTION 'Duplicate resolution failed: %', v_result; END IF;
END;
$$;

DO $$
DECLARE
  v_instance uuid := gen_random_uuid();
  v_practitioner uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.practitioners(id, name, status)
  VALUES (v_practitioner, 'Phase 2 ledger practitioner', 'active');
  INSERT INTO public.kobo_resolution_ledger(
    source_identity, source_fingerprint, canonical_practitioner_ids,
    reason_code, decision, source_sha256
  ) VALUES (
    v_instance::text, encode(extensions.digest(v_instance::text, 'sha256'), 'hex'), ARRAY[v_practitioner],
    'MANUAL_REVIEW_EXISTING_IDENTITIES_CONFIRMED', '{}'::jsonb, repeat('a', 64)
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.kobo_resolution_ledger
    WHERE source_identity = v_instance::text AND canonical_practitioner_ids = ARRAY[v_practitioner]
  ) THEN RAISE EXCEPTION 'Resolution ledger decision was not stored'; END IF;
END;
$$;

ROLLBACK;
