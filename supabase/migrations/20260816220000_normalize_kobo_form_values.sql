-- Normalize current Kobo XLSForm values into the established outreach model.

-- ---------------------------------------------------------------------------
-- Safe source-value parsers used by backfills and the raw-receipt RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.try_parse_timestamptz(p_value text)
RETURNS timestamptz
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF nullif(pg_catalog.btrim(p_value), '') IS NULL THEN RETURN NULL; END IF;
  RETURN p_value::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.try_parse_double_precision(p_value text)
RETURNS double precision
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF nullif(pg_catalog.btrim(p_value), '') IS NULL THEN RETURN NULL; END IF;
  RETURN p_value::double precision;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.try_parse_timestamptz(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.try_parse_double_precision(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Kobo source metadata belongs to the immutable/raw receipt, not the visit
-- ---------------------------------------------------------------------------

ALTER TABLE public.kobo_raw_submissions
  ADD COLUMN IF NOT EXISTS kobo_submission_id text,
  ADD COLUMN IF NOT EXISTS kobo_uuid text,
  ADD COLUMN IF NOT EXISTS kobo_submission_time timestamptz,
  ADD COLUMN IF NOT EXISTS kobo_submitted_by text,
  ADD COLUMN IF NOT EXISTS kobo_validation_status jsonb,
  ADD COLUMN IF NOT EXISTS kobo_status text,
  ADD COLUMN IF NOT EXISTS kobo_tags jsonb,
  ADD COLUMN IF NOT EXISTS kobo_notes jsonb,
  ADD COLUMN IF NOT EXISTS kobo_geolocation jsonb,
  ADD COLUMN IF NOT EXISTS kobo_form_uuid text,
  ADD COLUMN IF NOT EXISTS kobo_meta_instance_id text;

UPDATE public.kobo_raw_submissions
SET kobo_submission_id = nullif(payload->>'_id', ''),
    kobo_uuid = nullif(payload->>'_uuid', ''),
    kobo_submission_time = public.try_parse_timestamptz(payload->>'_submission_time'),
    kobo_submitted_by = nullif(payload->>'_submitted_by', ''),
    kobo_validation_status = nullif(payload->'_validation_status', 'null'::jsonb),
    kobo_status = nullif(payload->>'_status', ''),
    kobo_tags = nullif(payload->'_tags', 'null'::jsonb),
    kobo_notes = nullif(payload->'_notes', 'null'::jsonb),
    kobo_geolocation = nullif(payload->'_geolocation', 'null'::jsonb),
    kobo_form_uuid = nullif(payload->>'formhub/uuid', ''),
    kobo_meta_instance_id = nullif(payload->>'meta/instanceID', '');

CREATE OR REPLACE FUNCTION public.record_kobo_raw_submission(
  p_instance_id text,
  p_payload jsonb,
  p_payload_hash text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.kobo_raw_submissions(
    instance_id, payload, payload_hash, submitted_at,
    first_received_at, last_received_at, receive_count,
    kobo_submission_id, kobo_uuid, kobo_submission_time,
    kobo_submitted_by, kobo_validation_status, kobo_status,
    kobo_tags, kobo_notes, kobo_geolocation,
    kobo_form_uuid, kobo_meta_instance_id
  ) VALUES (
    p_instance_id, p_payload, p_payload_hash, now(), now(), now(), 1,
    nullif(p_payload->>'_id', ''),
    nullif(p_payload->>'_uuid', ''),
    public.try_parse_timestamptz(p_payload->>'_submission_time'),
    nullif(p_payload->>'_submitted_by', ''),
    nullif(p_payload->'_validation_status', 'null'::jsonb),
    nullif(p_payload->>'_status', ''),
    nullif(p_payload->'_tags', 'null'::jsonb),
    nullif(p_payload->'_notes', 'null'::jsonb),
    nullif(p_payload->'_geolocation', 'null'::jsonb),
    nullif(p_payload->>'formhub/uuid', ''),
    nullif(p_payload->>'meta/instanceID', '')
  )
  ON CONFLICT (instance_id) DO UPDATE SET
    payload = EXCLUDED.payload,
    payload_hash = EXCLUDED.payload_hash,
    last_received_at = now(),
    receive_count = public.kobo_raw_submissions.receive_count + 1,
    kobo_submission_id = EXCLUDED.kobo_submission_id,
    kobo_uuid = EXCLUDED.kobo_uuid,
    kobo_submission_time = EXCLUDED.kobo_submission_time,
    kobo_submitted_by = EXCLUDED.kobo_submitted_by,
    kobo_validation_status = EXCLUDED.kobo_validation_status,
    kobo_status = EXCLUDED.kobo_status,
    kobo_tags = EXCLUDED.kobo_tags,
    kobo_notes = EXCLUDED.kobo_notes,
    kobo_geolocation = EXCLUDED.kobo_geolocation,
    kobo_form_uuid = EXCLUDED.kobo_form_uuid,
    kobo_meta_instance_id = EXCLUDED.kobo_meta_instance_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_kobo_raw_submission(text,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_kobo_raw_submission(text,jsonb,text) TO service_role;

-- ---------------------------------------------------------------------------
-- Visit/session values and captured geopoint snapshot
-- ---------------------------------------------------------------------------

ALTER TABLE public.outreach_visits
  ADD COLUMN IF NOT EXISTS capture_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS capture_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS public_transport_accessible boolean,
  ADD COLUMN IF NOT EXISTS bookdash_given boolean,
  ADD COLUMN IF NOT EXISTS captured_latitude double precision,
  ADD COLUMN IF NOT EXISTS captured_longitude double precision,
  ADD COLUMN IF NOT EXISTS captured_altitude_m double precision,
  ADD COLUMN IF NOT EXISTS captured_accuracy_m double precision;

ALTER TABLE public.outreach_visits
  ADD CONSTRAINT outreach_visits_captured_latitude_bounds
    CHECK (captured_latitude IS NULL OR captured_latitude BETWEEN -90 AND 90) NOT VALID,
  ADD CONSTRAINT outreach_visits_captured_longitude_bounds
    CHECK (captured_longitude IS NULL OR captured_longitude BETWEEN -180 AND 180) NOT VALID,
  ADD CONSTRAINT outreach_visits_captured_accuracy_nonnegative
    CHECK (captured_accuracy_m IS NULL OR captured_accuracy_m >= 0) NOT VALID;

WITH source_values AS (
  SELECT v.id,
         public.try_parse_timestamptz(r.payload->>'start') AS capture_started_at,
         public.try_parse_timestamptz(r.payload->>'end') AS capture_ended_at,
         CASE pg_catalog.lower(r.payload->>'Is_this_site_accessi_by_public_transport')
           WHEN 'yes' THEN true WHEN 'no' THEN false ELSE NULL END AS public_transport_accessible,
         CASE pg_catalog.lower(r.payload->>'support/bookdash')
           WHEN 'yes' THEN true WHEN 'no' THEN false ELSE NULL END AS bookdash_given,
         pg_catalog.regexp_split_to_array(
           nullif(pg_catalog.btrim(r.payload->>'mapping/location'), ''), E'\\s+'
         ) AS coordinates
  FROM public.outreach_visits v
  JOIN public.kobo_raw_submissions r ON r.instance_id = v.kobo_instance_id
  WHERE v.source = 'kobo'
)
UPDATE public.outreach_visits v
SET capture_started_at = s.capture_started_at,
    capture_ended_at = s.capture_ended_at,
    public_transport_accessible = s.public_transport_accessible,
    bookdash_given = s.bookdash_given,
    captured_latitude = CASE
      WHEN public.try_parse_double_precision(s.coordinates[1]) BETWEEN -90 AND 90
        THEN public.try_parse_double_precision(s.coordinates[1]) ELSE NULL END,
    captured_longitude = CASE
      WHEN public.try_parse_double_precision(s.coordinates[2]) BETWEEN -180 AND 180
        THEN public.try_parse_double_precision(s.coordinates[2]) ELSE NULL END,
    captured_altitude_m = public.try_parse_double_precision(s.coordinates[3]),
    captured_accuracy_m = CASE
      WHEN public.try_parse_double_precision(s.coordinates[4]) >= 0
        THEN public.try_parse_double_precision(s.coordinates[4]) ELSE NULL END
FROM source_values s
WHERE s.id = v.id;

ALTER TABLE public.outreach_visits
  VALIDATE CONSTRAINT outreach_visits_captured_latitude_bounds;
ALTER TABLE public.outreach_visits
  VALIDATE CONSTRAINT outreach_visits_captured_longitude_bounds;
ALTER TABLE public.outreach_visits
  VALIDATE CONSTRAINT outreach_visits_captured_accuracy_nonnegative;

-- ---------------------------------------------------------------------------
-- Image references are visit attachments; binary transfer is a later worker
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.outreach_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES public.outreach_visits(id) ON DELETE CASCADE,
  source_system text NOT NULL DEFAULT 'kobo' CHECK (source_system = 'kobo'),
  source_instance_id text NOT NULL
    REFERENCES public.kobo_raw_submissions(instance_id) ON DELETE RESTRICT,
  source_field text NOT NULL,
  source_filename text NOT NULL CHECK (nullif(pg_catalog.btrim(source_filename), '') IS NOT NULL),
  transfer_status text NOT NULL DEFAULT 'pending'
    CHECK (transfer_status IN ('pending', 'downloaded', 'failed', 'skipped')),
  storage_bucket text,
  storage_path text,
  mime_type text,
  byte_size bigint CHECK (byte_size IS NULL OR byte_size >= 0),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at timestamptz,
  transferred_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (source_system, source_instance_id, source_field, source_filename),
  CHECK (
    (transfer_status = 'downloaded' AND storage_bucket IS NOT NULL
      AND storage_path IS NOT NULL AND transferred_at IS NOT NULL)
    OR transfer_status <> 'downloaded'
  )
);

CREATE INDEX IF NOT EXISTS outreach_attachments_visit_idx
  ON public.outreach_attachments(visit_id, created_at);
CREATE INDEX IF NOT EXISTS outreach_attachments_transfer_queue_idx
  ON public.outreach_attachments(transfer_status, created_at)
  WHERE transfer_status IN ('pending', 'failed');

INSERT INTO public.outreach_attachments(
  visit_id, source_system, source_instance_id, source_field, source_filename
)
SELECT v.id, 'kobo', v.kobo_instance_id, 'mapping/photo_site',
       pg_catalog.btrim(r.payload->>'mapping/photo_site')
FROM public.outreach_visits v
JOIN public.kobo_raw_submissions r ON r.instance_id = v.kobo_instance_id
WHERE v.source = 'kobo'
  AND nullif(pg_catalog.btrim(r.payload->>'mapping/photo_site'), '') IS NOT NULL
ON CONFLICT (source_system, source_instance_id, source_field, source_filename)
DO UPDATE SET visit_id = EXCLUDED.visit_id, updated_at = now();

ALTER TABLE public.outreach_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outreach attachments: authenticated read visible visit"
ON public.outreach_attachments FOR SELECT TO authenticated
USING (
  public.get_my_role() IN ('administrator', 'manager')
  OR EXISTS (
    SELECT 1 FROM public.outreach_visits v
    WHERE v.id = outreach_attachments.visit_id AND v.deleted_at IS NULL
  )
);

REVOKE ALL ON public.outreach_attachments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.outreach_attachments TO authenticated;
GRANT ALL ON public.outreach_attachments TO service_role;
