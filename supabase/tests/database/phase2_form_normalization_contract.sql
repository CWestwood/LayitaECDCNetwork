\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_instance uuid := gen_random_uuid();
  v_visit uuid := gen_random_uuid();
  v_payload jsonb;
BEGIN
  v_payload := jsonb_build_object(
    '_id', '12345',
    '_uuid', v_instance::text,
    '_submission_time', '2026-08-16T10:15:00+02:00',
    '_submitted_by', 'fixture-user',
    '_validation_status', jsonb_build_object('uid', 'validation_status_approved'),
    '_status', 'submitted_via_web',
    '_tags', jsonb_build_array('fixture'),
    '_notes', jsonb_build_array(jsonb_build_object('note', 'fixture note')),
    '_geolocation', jsonb_build_array(-31.9, 28.6),
    'formhub/uuid', 'fixture-form-uuid',
    'meta/instanceID', 'uuid:' || v_instance::text,
    'start', '2026-08-16T09:55:00+02:00',
    'end', '2026-08-16T10:05:00+02:00',
    'Is_this_site_accessi_by_public_transport', 'yes',
    'support/bookdash', 'no',
    'mapping/location', '-31.920722 28.656597 824.8 15.6',
    'mapping/photo_site', 'fixture-photo.jpg'
  );

  PERFORM public.record_kobo_raw_submission(v_instance::text, v_payload, 'normalization-hash');
  IF NOT EXISTS (
    SELECT 1 FROM public.kobo_raw_submissions
    WHERE instance_id = v_instance::text
      AND kobo_submission_id = '12345'
      AND kobo_uuid = v_instance::text
      AND kobo_submission_time = '2026-08-16T10:15:00+02:00'::timestamptz
      AND kobo_submitted_by = 'fixture-user'
      AND kobo_validation_status->>'uid' = 'validation_status_approved'
      AND kobo_status = 'submitted_via_web'
      AND kobo_tags = '["fixture"]'::jsonb
      AND kobo_form_uuid = 'fixture-form-uuid'
      AND kobo_meta_instance_id = 'uuid:' || v_instance::text
  ) THEN RAISE EXCEPTION 'Kobo receipt metadata was not normalized'; END IF;

  INSERT INTO public.outreach_visits(
    id, source, kobo_instance_id, capture_started_at, capture_ended_at,
    public_transport_accessible, bookdash_given,
    captured_latitude, captured_longitude, captured_altitude_m, captured_accuracy_m
  ) VALUES (
    v_visit, 'kobo', v_instance::text,
    '2026-08-16T09:55:00+02:00', '2026-08-16T10:05:00+02:00',
    true, false, -31.920722, 28.656597, 824.8, 15.6
  );
  INSERT INTO public.outreach_attachments(
    visit_id, source_system, source_instance_id, source_field, source_filename
  ) VALUES (
    v_visit, 'kobo', v_instance::text, 'mapping/photo_site', 'fixture-photo.jpg'
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.outreach_attachments
    WHERE visit_id = v_visit AND transfer_status = 'pending'
      AND source_filename = 'fixture-photo.jpg'
  ) THEN RAISE EXCEPTION 'Pending attachment reference was not normalized'; END IF;

  BEGIN
    UPDATE public.outreach_attachments SET transfer_status = 'downloaded'
    WHERE visit_id = v_visit;
    RAISE EXCEPTION 'Downloaded attachment without storage provenance was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$$;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.outreach_attachments', 'SELECT')
     OR has_table_privilege('authenticated', 'public.outreach_attachments', 'INSERT')
     OR has_function_privilege('authenticated', 'public.try_parse_timestamptz(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Normalization objects expose unintended client privileges';
  END IF;
END;
$$;

ROLLBACK;

