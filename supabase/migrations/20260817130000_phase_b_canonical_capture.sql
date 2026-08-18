-- Phase B: one versioned, idempotent transaction for every capture channel.

CREATE TABLE public.capture_submissions (
  capture_id text PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('kobo', 'website')),
  form_version text NOT NULL CHECK (nullif(pg_catalog.btrim(form_version), '') IS NOT NULL),
  request_hash text NOT NULL,
  submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  staff_id uuid REFERENCES public.layita_staff(id) ON DELETE RESTRICT,
  client_created_at timestamptz,
  server_received_at timestamptz NOT NULL DEFAULT now(),
  correlation_id text,
  result_visit_id uuid REFERENCES public.outreach_visits(id) ON DELETE RESTRICT,
  result jsonb,
  CHECK (nullif(pg_catalog.btrim(capture_id), '') IS NOT NULL),
  CHECK (length(capture_id) <= 200),
  CHECK (length(form_version) <= 100),
  CHECK (correlation_id IS NULL OR length(correlation_id) <= 200)
);

CREATE INDEX capture_submissions_received_idx
  ON public.capture_submissions(server_received_at DESC);
CREATE INDEX capture_submissions_submitted_by_idx
  ON public.capture_submissions(submitted_by, server_received_at DESC);

ALTER TABLE public.capture_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "capture submissions: own or reviewer read"
ON public.capture_submissions FOR SELECT TO authenticated
USING (
  submitted_by = auth.uid()
  OR public.get_my_role() IN ('administrator', 'manager')
);
REVOKE ALL ON public.capture_submissions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.capture_submissions TO authenticated;
GRANT ALL ON public.capture_submissions TO service_role;

ALTER TABLE public.outreach_visits DROP CONSTRAINT outreach_visits_source_check;
ALTER TABLE public.outreach_visits ADD CONSTRAINT outreach_visits_source_check
  CHECK (source IN ('kobo', 'website', 'manual', 'manual_edit'));

ALTER TABLE public.outreach_attachments
  DROP CONSTRAINT outreach_attachments_source_system_check,
  DROP CONSTRAINT outreach_attachments_source_system_source_instance_id_sourc_key,
  ALTER COLUMN source_instance_id DROP NOT NULL,
  ADD COLUMN capture_id text REFERENCES public.capture_submissions(capture_id) ON DELETE RESTRICT,
  ADD CONSTRAINT outreach_attachments_source_system_check CHECK (source_system IN ('kobo', 'website')),
  ADD CONSTRAINT outreach_attachments_source_reference_check CHECK (
    (source_system = 'kobo' AND source_instance_id IS NOT NULL)
    OR (source_system = 'website' AND capture_id IS NOT NULL)
  );

CREATE UNIQUE INDEX outreach_attachments_capture_key
  ON public.outreach_attachments(capture_id, source_field, source_filename)
  WHERE capture_id IS NOT NULL;
CREATE UNIQUE INDEX outreach_attachments_kobo_source_key
  ON public.outreach_attachments(source_system, source_instance_id, source_field, source_filename)
  WHERE source_system = 'kobo';

CREATE OR REPLACE FUNCTION public.submit_outreach_capture(
  p_capture_id text,
  p_source text,
  p_form_version text,
  p_payload jsonb,
  p_client_created_at timestamptz DEFAULT NULL,
  p_correlation_id text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_role text;
  v_staff uuid;
  v_hash text;
  v_existing public.capture_submissions%ROWTYPE;
  v_visit jsonb;
  v_ecdc jsonb;
  v_ecdc_values jsonb;
  v_ecdc_id uuid;
  v_practitioner jsonb;
  v_practitioner_values jsonb;
  v_practitioner_id uuid;
  v_training jsonb;
  v_visit_id uuid;
  v_result jsonb;
  v_participant text;
  v_participant_id uuid;
  v_attachment jsonb;
  v_external_id text;
  v_area_id uuid;
  v_field text;
BEGIN
  p_capture_id := nullif(pg_catalog.btrim(p_capture_id), '');
  p_source := lower(nullif(pg_catalog.btrim(p_source), ''));
  p_form_version := nullif(pg_catalog.btrim(p_form_version), '');

  IF p_capture_id IS NULL OR length(p_capture_id) > 200
     OR p_source IS NULL OR p_source NOT IN ('kobo', 'website')
     OR p_form_version IS DISTINCT FROM 'capture-v1'
     OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR jsonb_typeof(p_payload->'visit') IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_CAPTURE');
  END IF;

  v_visit := p_payload->'visit';
  v_external_id := coalesce(nullif(pg_catalog.btrim(p_payload->>'external_id'), ''), p_capture_id);
  IF nullif(pg_catalog.btrim(v_visit->>'date'), '') IS NULL
     OR (v_visit->>'date') !~ '^\d{4}-\d{2}-\d{2}$'
     OR (v_visit->>'outreach_type') NOT IN (
       'caregiver_training', 'literacy_promotion', 'practitioner_support',
       'ecdc_mapping', 'interested_practitioner', 'ecdc_update', 'other'
     ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_VISIT');
  END IF;
  IF (v_visit->>'outreach_type') IN (
       'caregiver_training', 'literacy_promotion', 'practitioner_support', 'ecdc_mapping', 'other'
     ) AND (v_visit->>'outreach_happened') NOT IN (
       'happened', 'different_to_planned', 'did_not_happen'
     ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_OUTCOME');
  END IF;
  IF v_visit->>'outreach_happened' = 'different_to_planned'
     AND nullif(pg_catalog.btrim(v_visit->>'did_instead'), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALTERNATIVE_ACTIVITY_REQUIRED');
  END IF;
  FOREACH v_field IN ARRAY ARRAY[
    'transport_cost', 'transport_km', 'parents_enrolled', 'parents_trained',
    'children_books', 'books_per_child', 'books_to_practitioner', 'people_reached',
    'captured_latitude', 'captured_longitude', 'captured_altitude_m', 'captured_accuracy_m'
  ] LOOP
    IF v_visit ? v_field AND jsonb_typeof(v_visit->v_field) NOT IN ('number', 'null') THEN
      RETURN jsonb_build_object('success', false, 'code', 'INVALID_FIELD_TYPE', 'field', v_field);
    END IF;
  END LOOP;
  IF coalesce((v_visit->>'transport_cost')::numeric, 0) < 0
     OR coalesce((v_visit->>'transport_km')::numeric, 0) < 0
     OR coalesce((v_visit->>'parents_enrolled')::numeric, 0) < 0
     OR coalesce((v_visit->>'parents_trained')::numeric, 0) < 0
     OR coalesce((v_visit->>'children_books')::numeric, 0) < 0
     OR coalesce((v_visit->>'books_per_child')::numeric, 0) < 0
     OR coalesce((v_visit->>'books_to_practitioner')::numeric, 0) < 0
     OR coalesce((v_visit->>'people_reached')::numeric, 0) < 0
     OR coalesce((v_visit->>'captured_accuracy_m')::numeric, 0) < 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'NEGATIVE_VALUE');
  END IF;
  IF (v_visit->>'parents_enrolled') IS NOT NULL
     AND (v_visit->>'parents_trained') IS NOT NULL
     AND (v_visit->>'parents_trained')::numeric > (v_visit->>'parents_enrolled')::numeric THEN
    RETURN jsonb_build_object('success', false, 'code', 'ATTENDANCE_EXCEEDS_ENROLMENT');
  END IF;
  IF coalesce((v_visit->>'captured_latitude')::double precision BETWEEN -90 AND 90, true) IS NOT TRUE
     OR coalesce((v_visit->>'captured_longitude')::double precision BETWEEN -180 AND 180, true) IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_COORDINATES');
  END IF;

  v_role := auth.role();
  IF p_source = 'kobo' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED_SOURCE');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.kobo_raw_submissions WHERE instance_id = v_external_id) THEN
      RETURN jsonb_build_object('success', false, 'code', 'RAW_SUBMISSION_NOT_FOUND');
    END IF;
    v_actor := p_actor_id;
    IF nullif(p_payload->>'staff_id', '') IS NOT NULL THEN
      v_staff := (p_payload->>'staff_id')::uuid;
      IF NOT EXISTS (SELECT 1 FROM public.layita_staff WHERE id = v_staff AND is_active) THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_STAFF');
      END IF;
    END IF;
  ELSE
    v_actor := auth.uid();
    SELECT p.layita_staff_id INTO v_staff
    FROM public.profiles p
    JOIN public.layita_staff s ON s.id = p.layita_staff_id AND s.is_active
    WHERE p.id = v_actor
      AND p.is_active
      AND p.role IN ('administrator', 'manager', 'datacapturer');
    IF v_actor IS NULL OR v_staff IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'CAPTURE_NOT_ALLOWED');
    END IF;
  END IF;

  v_hash := encode(extensions.digest(p_payload::text, 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_capture_id, 0));
  SELECT * INTO v_existing FROM public.capture_submissions WHERE capture_id = p_capture_id;
  IF FOUND THEN
    IF v_existing.source = p_source AND v_existing.form_version = p_form_version
       AND v_existing.request_hash = v_hash THEN
      RETURN coalesce(v_existing.result, '{}'::jsonb)
        || jsonb_build_object('success', true, 'duplicate', true);
    END IF;
    RETURN jsonb_build_object('success', false, 'code', 'CAPTURE_ID_CONFLICT');
  END IF;

  INSERT INTO public.capture_submissions(
    capture_id, source, form_version, request_hash, submitted_by, staff_id,
    client_created_at, correlation_id
  ) VALUES (
    p_capture_id, p_source, p_form_version, v_hash, v_actor, v_staff,
    p_client_created_at, nullif(pg_catalog.btrim(p_correlation_id), '')
  );

  v_ecdc := p_payload->'ecdc';
  IF jsonb_typeof(v_ecdc) = 'object' THEN
    v_ecdc_values := coalesce(v_ecdc->'values', '{}'::jsonb);
    IF nullif(v_ecdc->>'id', '') IS NOT NULL THEN
      v_ecdc_id := (v_ecdc->>'id')::uuid;
      IF NOT EXISTS (SELECT 1 FROM public.ecdc_list WHERE id = v_ecdc_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CAPTURE_ECDC_NOT_FOUND';
      END IF;
      UPDATE public.ecdc_list e SET
        name = CASE WHEN v_ecdc_values ? 'name' THEN nullif(pg_catalog.btrim(v_ecdc_values->>'name'), '') ELSE e.name END,
        area = CASE WHEN v_ecdc_values ? 'area' THEN nullif(pg_catalog.btrim(v_ecdc_values->>'area'), '') ELSE e.area END,
        number_children = CASE WHEN v_ecdc_values ? 'number_children' THEN nullif(pg_catalog.btrim(v_ecdc_values->>'number_children'), '') ELSE e.number_children END,
        chief = CASE WHEN v_ecdc_values ? 'chief' THEN nullif(pg_catalog.btrim(v_ecdc_values->>'chief'), '') ELSE e.chief END,
        headman = CASE WHEN v_ecdc_values ? 'headman' THEN nullif(pg_catalog.btrim(v_ecdc_values->>'headman'), '') ELSE e.headman END,
        latitude = CASE WHEN v_ecdc_values ? 'latitude' THEN (v_ecdc_values->>'latitude')::double precision ELSE e.latitude END,
        longitude = CASE WHEN v_ecdc_values ? 'longitude' THEN (v_ecdc_values->>'longitude')::double precision ELSE e.longitude END
      WHERE e.id = v_ecdc_id;
    ELSIF nullif(pg_catalog.btrim(v_ecdc_values->>'name'), '') IS NOT NULL THEN
      v_ecdc_id := gen_random_uuid();
      IF nullif(v_ecdc_values->>'area_id', '') IS NOT NULL THEN
        v_area_id := (v_ecdc_values->>'area_id')::uuid;
      ELSE
        SELECT id INTO v_area_id FROM public.area ORDER BY created_at, id LIMIT 1;
      END IF;
      IF v_area_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CAPTURE_AREA_REQUIRED';
      END IF;
      INSERT INTO public.ecdc_list(id, name, area, area_id, number_children, chief, headman, latitude, longitude)
      VALUES (
        v_ecdc_id, pg_catalog.btrim(v_ecdc_values->>'name'), nullif(pg_catalog.btrim(v_ecdc_values->>'area'), ''), v_area_id,
        nullif(pg_catalog.btrim(v_ecdc_values->>'number_children'), ''), nullif(pg_catalog.btrim(v_ecdc_values->>'chief'), ''),
        nullif(pg_catalog.btrim(v_ecdc_values->>'headman'), ''), (v_ecdc_values->>'latitude')::double precision,
        (v_ecdc_values->>'longitude')::double precision
      );
    END IF;
  END IF;

  v_practitioner := p_payload->'practitioner';
  IF jsonb_typeof(v_practitioner) = 'object' THEN
    v_practitioner_values := coalesce(v_practitioner->'values', '{}'::jsonb);
    IF nullif(v_practitioner->>'id', '') IS NOT NULL THEN
      v_practitioner_id := (v_practitioner->>'id')::uuid;
      IF NOT EXISTS (SELECT 1 FROM public.practitioners WHERE id = v_practitioner_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CAPTURE_PRACTITIONER_NOT_FOUND';
      END IF;
      UPDATE public.practitioners p SET
        name = CASE WHEN v_practitioner_values ? 'name' THEN nullif(pg_catalog.btrim(v_practitioner_values->>'name'), '') ELSE p.name END,
        contact_number1 = CASE WHEN v_practitioner_values ? 'contact_number1' THEN nullif(pg_catalog.btrim(v_practitioner_values->>'contact_number1'), '') ELSE p.contact_number1 END,
        contact_number2 = CASE WHEN v_practitioner_values ? 'contact_number2' THEN nullif(pg_catalog.btrim(v_practitioner_values->>'contact_number2'), '') ELSE p.contact_number2 END,
        has_whatsapp = CASE WHEN v_practitioner_values ? 'has_whatsapp' THEN (v_practitioner_values->>'has_whatsapp')::boolean ELSE p.has_whatsapp END,
        dsd_registered = CASE WHEN v_practitioner_values ? 'dsd_registered' THEN (v_practitioner_values->>'dsd_registered')::boolean ELSE p.dsd_registered END,
        dsd_funded = CASE WHEN v_practitioner_values ? 'dsd_funded' THEN (v_practitioner_values->>'dsd_funded')::boolean ELSE p.dsd_funded END,
        group_id = CASE WHEN v_practitioner_values ? 'group_id' THEN (v_practitioner_values->>'group_id')::uuid ELSE p.group_id END,
        "group" = CASE WHEN v_practitioner_values ? 'group' THEN nullif(pg_catalog.btrim(v_practitioner_values->>'group'), '') ELSE p."group" END,
        ecdc_id = coalesce(v_ecdc_id, p.ecdc_id),
        status = CASE WHEN v_practitioner_values ? 'status' THEN v_practitioner_values->>'status' ELSE p.status END,
        updated_at = now()
      WHERE p.id = v_practitioner_id;
    ELSIF nullif(pg_catalog.btrim(v_practitioner_values->>'name'), '') IS NOT NULL THEN
      v_practitioner_id := gen_random_uuid();
      INSERT INTO public.practitioners(
        id, name, contact_number1, contact_number2, has_whatsapp, dsd_registered,
        dsd_funded, group_id, "group", ecdc_id, status
      ) VALUES (
        v_practitioner_id, pg_catalog.btrim(v_practitioner_values->>'name'),
        nullif(pg_catalog.btrim(v_practitioner_values->>'contact_number1'), ''),
        nullif(pg_catalog.btrim(v_practitioner_values->>'contact_number2'), ''),
        (v_practitioner_values->>'has_whatsapp')::boolean,
        (v_practitioner_values->>'dsd_registered')::boolean,
        (v_practitioner_values->>'dsd_funded')::boolean,
        (v_practitioner_values->>'group_id')::uuid,
        nullif(pg_catalog.btrim(v_practitioner_values->>'group'), ''), v_ecdc_id,
        coalesce(nullif(v_practitioner_values->>'status', ''), 'active')
      );
    END IF;

    v_training := v_practitioner->'training';
    IF v_practitioner_id IS NOT NULL AND jsonb_typeof(v_training) = 'object' THEN
      INSERT INTO public.training(id, first_aid_ever, level4_ever, level5_ever, other)
      VALUES (
        v_practitioner_id, (v_training->>'first_aid_ever')::boolean,
        (v_training->>'level4_ever')::boolean, (v_training->>'level5_ever')::boolean,
        nullif(pg_catalog.btrim(v_training->>'other'), '')
      )
      ON CONFLICT (id) DO UPDATE SET
        first_aid_ever = CASE WHEN v_training ? 'first_aid_ever' THEN EXCLUDED.first_aid_ever ELSE public.training.first_aid_ever END,
        level4_ever = CASE WHEN v_training ? 'level4_ever' THEN EXCLUDED.level4_ever ELSE public.training.level4_ever END,
        level5_ever = CASE WHEN v_training ? 'level5_ever' THEN EXCLUDED.level5_ever ELSE public.training.level5_ever END,
        other = CASE WHEN v_training ? 'other' THEN EXCLUDED.other ELSE public.training.other END;
    END IF;
  END IF;

  IF nullif(v_visit->>'practitioner_id', '') IS NOT NULL THEN
    v_practitioner_id := (v_visit->>'practitioner_id')::uuid;
  END IF;

  INSERT INTO public.outreach_visits(
    date, data_capturer_id, outreach_type, comments, outreach_happened, did_instead,
    transport_type, transport_cost, transport_km, practitioner_id, parents_enrolled,
    parents_trained, children_books, books_per_child, books_to_practitioner, photos_taken,
    kobo_instance_id, source, people_reached, capture_started_at, capture_ended_at,
    public_transport_accessible, bookdash_given, captured_latitude, captured_longitude,
    captured_altitude_m, captured_accuracy_m
  ) VALUES (
    (v_visit->>'date')::date, v_staff, v_visit->>'outreach_type', v_visit->>'comments',
    v_visit->>'outreach_happened', v_visit->>'did_instead', v_visit->>'transport_type',
    (v_visit->>'transport_cost')::numeric, (v_visit->>'transport_km')::numeric,
    v_practitioner_id, (v_visit->>'parents_enrolled')::numeric,
    (v_visit->>'parents_trained')::numeric, (v_visit->>'children_books')::numeric,
    (v_visit->>'books_per_child')::numeric, (v_visit->>'books_to_practitioner')::numeric,
    (v_visit->>'photos_taken')::boolean, CASE WHEN p_source = 'kobo' THEN v_external_id END,
    p_source, (v_visit->>'people_reached')::numeric,
    (v_visit->>'capture_started_at')::timestamptz, (v_visit->>'capture_ended_at')::timestamptz,
    (v_visit->>'public_transport_accessible')::boolean, (v_visit->>'bookdash_given')::boolean,
    (v_visit->>'captured_latitude')::double precision, (v_visit->>'captured_longitude')::double precision,
    (v_visit->>'captured_altitude_m')::double precision, (v_visit->>'captured_accuracy_m')::double precision
  )
  ON CONFLICT (kobo_instance_id) DO UPDATE SET
    date = EXCLUDED.date, data_capturer_id = EXCLUDED.data_capturer_id,
    outreach_type = EXCLUDED.outreach_type, comments = EXCLUDED.comments,
    outreach_happened = EXCLUDED.outreach_happened, did_instead = EXCLUDED.did_instead,
    transport_type = EXCLUDED.transport_type, transport_cost = EXCLUDED.transport_cost,
    transport_km = EXCLUDED.transport_km, practitioner_id = EXCLUDED.practitioner_id,
    parents_enrolled = EXCLUDED.parents_enrolled, parents_trained = EXCLUDED.parents_trained,
    children_books = EXCLUDED.children_books, books_per_child = EXCLUDED.books_per_child,
    books_to_practitioner = EXCLUDED.books_to_practitioner, photos_taken = EXCLUDED.photos_taken,
    people_reached = EXCLUDED.people_reached, capture_started_at = EXCLUDED.capture_started_at,
    capture_ended_at = EXCLUDED.capture_ended_at,
    public_transport_accessible = EXCLUDED.public_transport_accessible,
    bookdash_given = EXCLUDED.bookdash_given, captured_latitude = EXCLUDED.captured_latitude,
    captured_longitude = EXCLUDED.captured_longitude,
    captured_altitude_m = EXCLUDED.captured_altitude_m,
    captured_accuracy_m = EXCLUDED.captured_accuracy_m
  RETURNING id INTO v_visit_id;

  DELETE FROM public.outreach_visit_practitioners WHERE visit_id = v_visit_id;
  IF v_practitioner_id IS NOT NULL THEN
    INSERT INTO public.outreach_visit_practitioners(visit_id, practitioner_id, participation_role)
    VALUES (v_visit_id, v_practitioner_id, 'primary');
  END IF;
  IF jsonb_typeof(p_payload->'practitioner_ids') = 'array' THEN
    FOR v_participant IN SELECT jsonb_array_elements_text(p_payload->'practitioner_ids') LOOP
      v_participant_id := v_participant::uuid;
      IF NOT EXISTS (SELECT 1 FROM public.practitioners WHERE id = v_participant_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CAPTURE_PARTICIPANT_NOT_FOUND';
      END IF;
      INSERT INTO public.outreach_visit_practitioners(visit_id, practitioner_id, participation_role)
      VALUES (v_visit_id, v_participant_id, CASE WHEN v_participant_id = v_practitioner_id THEN 'primary' ELSE 'additional' END)
      ON CONFLICT (visit_id, practitioner_id) DO NOTHING;
    END LOOP;
  END IF;

  INSERT INTO public.outreach_visit_sources(
    visit_id, source_system, external_id, payload_hash, original_visit_id, metadata
  ) VALUES (
    v_visit_id, p_source, v_external_id, v_hash, v_visit_id,
    jsonb_strip_nulls(jsonb_build_object('form_version', p_form_version, 'correlation_id', p_correlation_id))
  )
  ON CONFLICT (source_system, external_id) DO UPDATE SET
    visit_id = EXCLUDED.visit_id, payload_hash = EXCLUDED.payload_hash,
    metadata = EXCLUDED.metadata;

  IF jsonb_typeof(p_payload->'attachments') = 'array' THEN
    FOR v_attachment IN SELECT value FROM jsonb_array_elements(p_payload->'attachments') LOOP
      IF nullif(pg_catalog.btrim(v_attachment->>'source_field'), '') IS NOT NULL
         AND nullif(pg_catalog.btrim(v_attachment->>'source_filename'), '') IS NOT NULL THEN
        IF p_source = 'kobo' THEN
          INSERT INTO public.outreach_attachments(
            visit_id, source_system, source_instance_id, capture_id, source_field, source_filename, mime_type
          ) VALUES (
            v_visit_id, p_source, v_external_id, p_capture_id,
            v_attachment->>'source_field', v_attachment->>'source_filename',
            nullif(pg_catalog.btrim(v_attachment->>'mime_type'), '')
          )
          ON CONFLICT (source_system, source_instance_id, source_field, source_filename)
            WHERE source_system = 'kobo'
          DO UPDATE SET visit_id = EXCLUDED.visit_id, capture_id = EXCLUDED.capture_id, updated_at = now();
        ELSE
          INSERT INTO public.outreach_attachments(
            visit_id, source_system, capture_id, source_field, source_filename, mime_type
          ) VALUES (
            v_visit_id, p_source, p_capture_id, v_attachment->>'source_field',
            v_attachment->>'source_filename', nullif(pg_catalog.btrim(v_attachment->>'mime_type'), '')
          )
          ON CONFLICT (capture_id, source_field, source_filename) WHERE capture_id IS NOT NULL
          DO UPDATE SET visit_id = EXCLUDED.visit_id, updated_at = now();
        END IF;
      END IF;
    END LOOP;
  END IF;

  v_result := jsonb_build_object(
    'success', true, 'duplicate', false, 'visit_id', v_visit_id,
    'ecdc_id', v_ecdc_id, 'practitioner_id', v_practitioner_id
  );
  UPDATE public.capture_submissions
  SET result_visit_id = v_visit_id, result = v_result
  WHERE capture_id = p_capture_id;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_outreach_capture(text, text, text, jsonb, timestamptz, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_outreach_capture(text, text, text, jsonb, timestamptz, text, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.submit_outreach_capture(text, text, text, jsonb, timestamptz, text, uuid) IS
  'Canonical Phase B capture transaction. Website identity is derived from auth; Kobo is service-role only.';
