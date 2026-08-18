\set ON_ERROR_STOP on

BEGIN;

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) VALUES
  ('00000000-0000-4000-8000-0000000000c1'),
  ('00000000-0000-4000-8000-0000000000c2'),
  ('00000000-0000-4000-8000-0000000000c3')
ON CONFLICT (id) DO NOTHING;
SET LOCAL session_replication_role = origin;

INSERT INTO public.layita_staff(id, name) VALUES
  ('00000000-0000-4000-8000-0000000000d1', 'Phase B capturer'),
  ('00000000-0000-4000-8000-0000000000d2', 'Phase B other staff')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles(id, name, email, role, layita_staff_id, is_active) VALUES
  ('00000000-0000-4000-8000-0000000000c1', 'Phase B capturer', 'phase-b-capturer@example.invalid', 'datacapturer', '00000000-0000-4000-8000-0000000000d1', true),
  ('00000000-0000-4000-8000-0000000000c2', 'Phase B library', 'phase-b-library@example.invalid', 'library', NULL, true),
  ('00000000-0000-4000-8000-0000000000c3', 'Phase B unlinked', 'phase-b-unlinked@example.invalid', 'datacapturer', NULL, true)
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, layita_staff_id = EXCLUDED.layita_staff_id, is_active = true;

INSERT INTO public.area(id, name) VALUES
  ('00000000-0000-4000-8000-0000000000e0', 'Phase B area')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.ecdc_list(id, name, area_id) VALUES
  ('00000000-0000-4000-8000-0000000000e1', 'Phase B ECDC', '00000000-0000-4000-8000-0000000000e0')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.practitioners(id, name, ecdc_id) VALUES
  ('00000000-0000-4000-8000-0000000000f1', 'Phase B primary', '00000000-0000-4000-8000-0000000000e1'),
  ('00000000-0000-4000-8000-0000000000f2', 'Phase B additional', '00000000-0000-4000-8000-0000000000e1')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.kobo_raw_submissions(instance_id, payload)
VALUES ('phase-b-kobo-raw-1', '{}'::jsonb)
ON CONFLICT (instance_id) DO NOTHING;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c1', true);

DO $$
DECLARE
  v_payload jsonb := jsonb_build_object(
    'external_id', 'website-phase-b-1',
    'staff_id', '00000000-0000-4000-8000-0000000000d2',
    'visit', jsonb_build_object(
      'date', '2026-08-17', 'outreach_type', 'practitioner_support', 'outreach_happened', 'happened',
      'practitioner_id', '00000000-0000-4000-8000-0000000000f1',
      'parents_enrolled', 12, 'parents_trained', 8, 'transport_cost', 20,
      'captured_latitude', -31.9, 'captured_longitude', 28.6
    ),
    'practitioner_ids', jsonb_build_array(
      '00000000-0000-4000-8000-0000000000f1',
      '00000000-0000-4000-8000-0000000000f2'
    ),
    'attachments', jsonb_build_array(jsonb_build_object(
      'source_field', 'site_photo', 'source_filename', 'phase-b.jpg', 'mime_type', 'image/jpeg'
    ))
  );
  v_first jsonb;
  v_retry jsonb;
  v_visit uuid;
BEGIN
  v_first := public.submit_outreach_capture(
    'website-phase-b-capture-1', 'website', 'capture-v1', v_payload,
    '2026-08-17T08:30:00+02:00', 'phase-b-correlation', NULL
  );
  IF NOT coalesce((v_first->>'success')::boolean, false) OR (v_first->>'duplicate')::boolean THEN
    RAISE EXCEPTION 'Valid website capture failed: %', v_first;
  END IF;
  v_visit := (v_first->>'visit_id')::uuid;
  IF (SELECT data_capturer_id FROM public.outreach_visits WHERE id = v_visit)
      <> '00000000-0000-4000-8000-0000000000d1'::uuid THEN
    RAISE EXCEPTION 'Website staff identity was not derived from the authenticated profile';
  END IF;
  IF (SELECT count(*) FROM public.outreach_visit_practitioners WHERE visit_id = v_visit) <> 2 THEN
    RAISE EXCEPTION 'Multiple practitioner links were not stored';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.outreach_attachments WHERE visit_id = v_visit AND capture_id = 'website-phase-b-capture-1') THEN
    RAISE EXCEPTION 'Attachment metadata was not stored';
  END IF;

  v_retry := public.submit_outreach_capture(
    'website-phase-b-capture-1', 'website', 'capture-v1', v_payload,
    '2026-08-17T08:30:00+02:00', 'phase-b-correlation', NULL
  );
  IF NOT coalesce((v_retry->>'duplicate')::boolean, false)
     OR v_retry->>'visit_id' <> v_first->>'visit_id' THEN
    RAISE EXCEPTION 'Exact retry was not idempotent: %', v_retry;
  END IF;
  IF (SELECT count(*) FROM public.capture_submissions WHERE capture_id = 'website-phase-b-capture-1') <> 1 THEN
    RAISE EXCEPTION 'Retry created a duplicate capture submission';
  END IF;

  v_retry := public.submit_outreach_capture(
    'website-phase-b-capture-1', 'website', 'capture-v1',
    jsonb_set(v_payload, '{visit,comments}', '"different"'), NULL, NULL, NULL
  );
  IF v_retry->>'code' <> 'CAPTURE_ID_CONFLICT' THEN
    RAISE EXCEPTION 'Mutated immutable capture ID was accepted: %', v_retry;
  END IF;
END;
$$;

DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.submit_outreach_capture(
    'invalid-phase-b', 'website', 'capture-v1', '{"visit":{"date":"2026-08-17"}}', NULL, NULL, NULL
  );
  IF v_result->>'code' <> 'INVALID_VISIT' THEN RAISE EXCEPTION 'Invalid visit was accepted: %', v_result; END IF;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c2', true);
  v_result := public.submit_outreach_capture(
    'library-phase-b', 'website', 'capture-v1',
    '{"visit":{"date":"2026-08-17","outreach_type":"practitioner_support","outreach_happened":"happened"}}', NULL, NULL, NULL
  );
  IF v_result->>'code' <> 'CAPTURE_NOT_ALLOWED' THEN RAISE EXCEPTION 'Library capture was accepted: %', v_result; END IF;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c3', true);
  v_result := public.submit_outreach_capture(
    'unlinked-phase-b', 'website', 'capture-v1',
    '{"visit":{"date":"2026-08-17","outreach_type":"practitioner_support","outreach_happened":"happened"}}', NULL, NULL, NULL
  );
  IF v_result->>'code' <> 'CAPTURE_NOT_ALLOWED' THEN RAISE EXCEPTION 'Unlinked capture was accepted: %', v_result; END IF;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c1', true);
DO $$
DECLARE v_before bigint;
BEGIN
  SELECT count(*) INTO v_before FROM public.outreach_visits;
  BEGIN
    PERFORM public.submit_outreach_capture(
      'rollback-phase-b', 'website', 'capture-v1',
      jsonb_build_object(
        'visit', jsonb_build_object('date', '2026-08-17', 'outreach_type', 'practitioner_support', 'outreach_happened', 'happened'),
        'ecdc', jsonb_build_object('values', jsonb_build_object('name', 'Must roll back')),
        'practitioner_ids', jsonb_build_array('00000000-0000-4000-8000-000000000099')
      ), NULL, NULL, NULL
    );
    RAISE EXCEPTION 'Expected participant failure did not occur';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'CAPTURE_PARTICIPANT_NOT_FOUND' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.capture_submissions WHERE capture_id = 'rollback-phase-b')
     OR EXISTS (SELECT 1 FROM public.ecdc_list WHERE name = 'Must roll back')
     OR (SELECT count(*) FROM public.outreach_visits) <> v_before THEN
    RAISE EXCEPTION 'Failing domain write left partial canonical state';
  END IF;
END;
$$;

DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.submit_outreach_capture(
    'kobo-denied-phase-b', 'kobo', 'capture-v1',
    '{"external_id":"no-raw","visit":{"date":"2026-08-17","outreach_type":"practitioner_support","outreach_happened":"happened"}}',
    NULL, NULL, NULL
  );
  IF v_result->>'code' <> 'UNAUTHORIZED_SOURCE' THEN
    RAISE EXCEPTION 'Authenticated user was allowed to claim Kobo source: %', v_result;
  END IF;
END;
$$;

RESET ROLE;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.submit_outreach_capture(
    'phase-b-kobo-attempt-1', 'kobo', 'capture-v1',
    jsonb_build_object(
      'external_id', 'phase-b-kobo-raw-1',
      'staff_id', '00000000-0000-4000-8000-0000000000d1',
      'visit', jsonb_build_object(
        'date', '2026-08-17', 'outreach_type', 'caregiver_training', 'outreach_happened', 'happened',
        'practitioner_id', '00000000-0000-4000-8000-0000000000f1'
      )
    ), NULL, 'phase-b-kobo-correlation', NULL
  );
  IF NOT coalesce((v_result->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'Service-role Kobo capture failed: %', v_result;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.outreach_visits
    WHERE id = (v_result->>'visit_id')::uuid AND kobo_instance_id = 'phase-b-kobo-raw-1'
  ) THEN
    RAISE EXCEPTION 'Kobo external identity was not retained on the visit';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
