-- Phase 2: deterministic Kobo ingestion, reconciliation, and governed repair.

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_type text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS actor_reference text,
  ADD COLUMN IF NOT EXISTS change_reason text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'database',
  ADD COLUMN IF NOT EXISTS correlation_id uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE public.audit_logs SET actor_type = 'user' WHERE changed_by_id IS NOT NULL;
ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_actor_type_check;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_actor_type_check CHECK (actor_type IN ('user', 'system', 'webhook', 'ledger'));

CREATE OR REPLACE FUNCTION public.log_table_updates()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old jsonb := to_jsonb(OLD);
  v_new jsonb := to_jsonb(NEW);
  v_diff jsonb := '{}'::jsonb;
  v_key text;
  v_actor uuid := auth.uid();
  v_actor_type text := nullif(current_setting('app.actor_type', true), '');
BEGIN
  FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
    IF v_old->v_key IS DISTINCT FROM v_new->v_key AND v_key <> 'updated_at' THEN
      v_diff := v_diff || jsonb_build_object(
        v_key, jsonb_build_object('old', v_old->v_key, 'new', v_new->v_key)
      );
    END IF;
  END LOOP;
  IF v_diff <> '{}'::jsonb THEN
    INSERT INTO public.audit_logs(
      table_name, record_id, changed_fields, changed_by_id,
      actor_type, actor_reference, change_reason, source, correlation_id
    ) VALUES (
      TG_TABLE_NAME, NEW.id, v_diff, v_actor,
      coalesce(v_actor_type, CASE WHEN v_actor IS NULL THEN 'system' ELSE 'user' END),
      coalesce(nullif(current_setting('app.actor_reference', true), ''), v_actor::text),
      nullif(current_setting('app.change_reason', true), ''),
      coalesce(nullif(current_setting('app.change_source', true), ''), 'database'),
      nullif(current_setting('app.correlation_id', true), '')::uuid
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Processing provenance and immutable attempt history
-- ---------------------------------------------------------------------------

ALTER TABLE public.kobo_processed
  DROP CONSTRAINT IF EXISTS kobo_processed_status_check;
ALTER TABLE public.kobo_processed
  ADD CONSTRAINT kobo_processed_status_check
  CHECK (status IN ('processing', 'success', 'failed', 'partial', 'quarantined', 'ignored'));
ALTER TABLE public.kobo_processed
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_run_id uuid,
  ADD COLUMN IF NOT EXISTS processor_version text,
  ADD COLUMN IF NOT EXISTS result_visit_id uuid,
  ADD COLUMN IF NOT EXISTS actor_type text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS actor_id uuid,
  ADD COLUMN IF NOT EXISTS correction_reason text,
  ADD COLUMN IF NOT EXISTS warning_details jsonb,
  ADD COLUMN IF NOT EXISTS provenance jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.kobo_processed
  DROP CONSTRAINT IF EXISTS kobo_processed_actor_type_check;
ALTER TABLE public.kobo_processed
  ADD CONSTRAINT kobo_processed_actor_type_check
  CHECK (actor_type IN ('system', 'webhook', 'user', 'ledger'));
ALTER TABLE public.kobo_processed
  DROP CONSTRAINT IF EXISTS kobo_processed_result_visit_id_fkey;
ALTER TABLE public.kobo_processed
  ADD CONSTRAINT kobo_processed_result_visit_id_fkey
  FOREIGN KEY (result_visit_id) REFERENCES public.outreach_visits(id) ON DELETE SET NULL;
ALTER TABLE public.kobo_processed
  DROP CONSTRAINT IF EXISTS kobo_processed_actor_id_fkey;
ALTER TABLE public.kobo_processed
  ADD CONSTRAINT kobo_processed_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.kobo_raw_submissions
  ADD COLUMN IF NOT EXISTS payload_hash text,
  ADD COLUMN IF NOT EXISTS source_system text NOT NULL DEFAULT 'kobo',
  ADD COLUMN IF NOT EXISTS first_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS receive_count integer NOT NULL DEFAULT 1;

UPDATE public.kobo_raw_submissions
SET first_received_at = coalesce(first_received_at, submitted_at),
    last_received_at = coalesce(last_received_at, submitted_at),
    payload_hash = coalesce(payload_hash, encode(extensions.digest(coalesce(payload, '{}'::jsonb)::text, 'sha256'), 'hex'));

CREATE TABLE IF NOT EXISTS public.kobo_processing_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id text NOT NULL REFERENCES public.kobo_raw_submissions(instance_id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'success', 'failed', 'partial', 'quarantined', 'ignored')),
  trigger_source text NOT NULL CHECK (trigger_source IN ('webhook', 'reprocess', 'ledger', 'migration')),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_type text NOT NULL DEFAULT 'system' CHECK (actor_type IN ('system', 'webhook', 'user', 'ledger')),
  processor_version text NOT NULL,
  payload_hash text,
  result_visit_id uuid REFERENCES public.outreach_visits(id) ON DELETE SET NULL,
  error_message text,
  warnings jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (finished_at IS NULL OR finished_at >= started_at)
);
CREATE INDEX IF NOT EXISTS kobo_processing_attempts_instance_started_idx
  ON public.kobo_processing_attempts(instance_id, started_at DESC);
CREATE INDEX IF NOT EXISTS kobo_processing_attempts_actionable_idx
  ON public.kobo_processing_attempts(status, started_at DESC)
  WHERE status IN ('processing', 'failed', 'partial');

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
    first_received_at, last_received_at, receive_count
  ) VALUES (
    p_instance_id, p_payload, p_payload_hash, now(), now(), now(), 1
  )
  ON CONFLICT (instance_id) DO UPDATE SET
    payload = EXCLUDED.payload,
    payload_hash = EXCLUDED.payload_hash,
    last_received_at = now(),
    receive_count = public.kobo_raw_submissions.receive_count + 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_kobo_processing(
  p_instance_id text,
  p_trigger_source text,
  p_processor_version text,
  p_payload_hash text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL,
  p_force boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current public.kobo_processed%ROWTYPE;
  v_run_id uuid := gen_random_uuid();
BEGIN
  IF p_trigger_source NOT IN ('webhook', 'reprocess', 'ledger', 'migration') THEN
    RAISE EXCEPTION 'Unsupported trigger source';
  END IF;
  IF p_trigger_source = 'reprocess' AND p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Reprocessing requires an actor';
  END IF;

  INSERT INTO public.kobo_processed(instance_id, status)
  VALUES (p_instance_id, 'processing')
  ON CONFLICT (instance_id) DO NOTHING;

  SELECT * INTO v_current
  FROM public.kobo_processed
  WHERE instance_id = p_instance_id
  FOR UPDATE;

  IF NOT p_force AND v_current.status = 'success' THEN
    RETURN NULL;
  END IF;
  IF NOT p_force AND v_current.status = 'processing'
     AND v_current.processing_started_at > now() - interval '5 minutes' THEN
    RETURN NULL;
  END IF;

  UPDATE public.kobo_processed
  SET status = 'processing', processed_at = now(), processing_started_at = now(),
      attempt_count = attempt_count + 1, last_run_id = v_run_id,
      processor_version = p_processor_version, actor_id = p_actor_id,
      actor_type = CASE WHEN p_trigger_source = 'webhook' THEN 'webhook'
                        WHEN p_actor_id IS NOT NULL THEN 'user' ELSE 'system' END,
      error_message = NULL
  WHERE instance_id = p_instance_id;

  INSERT INTO public.kobo_processing_attempts(
    id, instance_id, trigger_source, actor_id, actor_type,
    processor_version, payload_hash
  ) VALUES (
    v_run_id, p_instance_id, p_trigger_source, p_actor_id,
    CASE WHEN p_trigger_source = 'webhook' THEN 'webhook'
         WHEN p_actor_id IS NOT NULL THEN 'user' ELSE 'system' END,
    p_processor_version, p_payload_hash
  );
  RETURN v_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_kobo_processing(
  p_run_id uuid,
  p_status text,
  p_result_visit_id uuid DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_warnings jsonb DEFAULT NULL,
  p_provenance jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_instance_id text;
BEGIN
  IF p_status NOT IN ('success', 'failed', 'partial', 'quarantined', 'ignored') THEN
    RAISE EXCEPTION 'Unsupported terminal processing status';
  END IF;
  UPDATE public.kobo_processing_attempts
  SET status = p_status, finished_at = now(), result_visit_id = p_result_visit_id,
      error_message = p_error_message, warnings = p_warnings,
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_provenance, '{}'::jsonb)
  WHERE id = p_run_id AND status = 'processing'
  RETURNING instance_id INTO v_instance_id;
  IF v_instance_id IS NULL THEN
    RAISE EXCEPTION 'Unknown or already-finished processing run';
  END IF;
  UPDATE public.kobo_processed
  SET status = p_status, processed_at = now(), processing_started_at = NULL,
      result_visit_id = p_result_visit_id, error_message = p_error_message,
      warnings = CASE WHEN p_warnings IS NULL THEN NULL ELSE p_warnings::text END,
      warning_details = p_warnings,
      provenance = coalesce(provenance, '{}'::jsonb) || coalesce(p_provenance, '{}'::jsonb)
  WHERE instance_id = v_instance_id AND last_run_id = p_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_kobo_processing(text,text,text,text,uuid,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_kobo_processing(uuid,text,uuid,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_kobo_raw_submission(text,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_kobo_processing(text,text,text,text,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_kobo_processing(uuid,text,uuid,text,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_kobo_raw_submission(text,jsonb,text) TO service_role;

-- ---------------------------------------------------------------------------
-- Idempotent unmatched queue
-- ---------------------------------------------------------------------------

ALTER TABLE public.kobo_unmatched
  ADD COLUMN IF NOT EXISTS occurrence_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS resolution_action text,
  ADD COLUMN IF NOT EXISTS resolution_reason text;

WITH duplicates AS (
  SELECT id, row_number() OVER (
    PARTITION BY instance_id, field, coalesce(raw_value, '') ORDER BY created_at, id
  ) AS ordinal
  FROM public.kobo_unmatched WHERE resolved_at IS NULL
)
UPDATE public.kobo_unmatched u
SET resolved_at = now(), resolution_action = 'deduplicated',
    resolution_reason = 'Phase 2 migration consolidated repeated unresolved logging'
FROM duplicates d WHERE d.id = u.id AND d.ordinal > 1;

CREATE UNIQUE INDEX IF NOT EXISTS kobo_unmatched_one_open_issue_idx
  ON public.kobo_unmatched(instance_id, field, coalesce(raw_value, ''))
  WHERE resolved_at IS NULL;

CREATE OR REPLACE FUNCTION public.record_kobo_unmatched(
  p_instance_id text,
  p_field text,
  p_raw_value text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.kobo_unmatched
  WHERE instance_id = p_instance_id AND field = p_field
    AND coalesce(raw_value, '') = coalesce(p_raw_value, '') AND resolved_at IS NULL
  FOR UPDATE;
  IF v_id IS NOT NULL THEN
    UPDATE public.kobo_unmatched
    SET occurrence_count = occurrence_count + 1, last_seen_at = now()
    WHERE id = v_id;
    RETURN v_id;
  END IF;
  INSERT INTO public.kobo_unmatched(instance_id, field, raw_value)
  VALUES (p_instance_id, p_field, p_raw_value) RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  UPDATE public.kobo_unmatched
  SET occurrence_count = occurrence_count + 1, last_seen_at = now()
  WHERE instance_id = p_instance_id AND field = p_field
    AND coalesce(raw_value, '') = coalesce(p_raw_value, '') AND resolved_at IS NULL
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_kobo_unmatched(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_kobo_unmatched(text,text,text) TO service_role;

-- ---------------------------------------------------------------------------
-- Reviewed local resolution ledger (imported separately; no personal data in migration)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.kobo_resolution_ledger (
  source_identity text PRIMARY KEY,
  source_fingerprint text NOT NULL UNIQUE,
  canonical_ecdc_id uuid REFERENCES public.ecdc_list(id) ON DELETE SET NULL,
  canonical_practitioner_ids uuid[] NOT NULL DEFAULT '{}',
  responsible_staff_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason_code text NOT NULL,
  accepted_exception text,
  decision jsonb NOT NULL,
  reviewer text,
  reviewed_at timestamptz,
  source_sha256 text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS kobo_resolution_ledger_reason_idx
  ON public.kobo_resolution_ledger(reason_code);

CREATE OR REPLACE FUNCTION public.validate_kobo_resolution_decision()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF NEW.source_identity !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Ledger source_identity must be a UUID';
  END IF;
  FOREACH v_id IN ARRAY NEW.canonical_practitioner_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.practitioners WHERE id = v_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Ledger practitioner % is not active', v_id;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS validate_kobo_resolution_decision_trigger ON public.kobo_resolution_ledger;
CREATE TRIGGER validate_kobo_resolution_decision_trigger
BEFORE INSERT OR UPDATE ON public.kobo_resolution_ledger
FOR EACH ROW EXECUTE FUNCTION public.validate_kobo_resolution_decision();

ALTER TABLE public.kobo_resolution_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resolution ledger: reviewer read"
ON public.kobo_resolution_ledger FOR SELECT TO authenticated
USING (public.get_my_role() IN ('administrator', 'manager'));
REVOKE ALL ON public.kobo_resolution_ledger FROM PUBLIC, anon;
GRANT SELECT ON public.kobo_resolution_ledger TO authenticated;
GRANT ALL ON public.kobo_resolution_ledger TO service_role;

-- ---------------------------------------------------------------------------
-- Visit source lineage, duplicate resolution, and audited correction
-- ---------------------------------------------------------------------------

ALTER TABLE public.practitioners
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason text;
ALTER TABLE public.ecdc_list
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason text;
ALTER TABLE public.outreach_visits
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason text,
  ADD COLUMN IF NOT EXISTS resolution_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS superseded_by_id uuid,
  ADD COLUMN IF NOT EXISTS resolution_reason text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid;
ALTER TABLE public.outreach_visits
  DROP CONSTRAINT IF EXISTS outreach_visits_resolution_status_check;
ALTER TABLE public.outreach_visits
  ADD CONSTRAINT outreach_visits_resolution_status_check
  CHECK (resolution_status IN ('active', 'superseded', 'void'));
ALTER TABLE public.outreach_visits
  DROP CONSTRAINT IF EXISTS outreach_visits_superseded_by_id_fkey;
ALTER TABLE public.outreach_visits
  ADD CONSTRAINT outreach_visits_superseded_by_id_fkey
  FOREIGN KEY (superseded_by_id) REFERENCES public.outreach_visits(id) ON DELETE RESTRICT;
ALTER TABLE public.outreach_visits
  DROP CONSTRAINT IF EXISTS outreach_visits_resolved_by_fkey;
ALTER TABLE public.outreach_visits
  ADD CONSTRAINT outreach_visits_resolved_by_fkey
  FOREIGN KEY (resolved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.outreach_visits
  ADD CONSTRAINT outreach_visits_not_self_superseded_check
  CHECK (superseded_by_id IS NULL OR superseded_by_id <> id);

CREATE TABLE IF NOT EXISTS public.outreach_visit_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES public.outreach_visits(id) ON DELETE CASCADE,
  source_system text NOT NULL,
  external_id text NOT NULL,
  payload_hash text,
  original_visit_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_system, external_id)
);
INSERT INTO public.outreach_visit_sources(visit_id, source_system, external_id, original_visit_id)
SELECT id, 'kobo', kobo_instance_id, id FROM public.outreach_visits
WHERE kobo_instance_id IS NOT NULL
ON CONFLICT (source_system, external_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.outreach_visit_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kept_visit_id uuid REFERENCES public.outreach_visits(id) ON DELETE SET NULL,
  discarded_visit_id uuid NOT NULL REFERENCES public.outreach_visits(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('merge', 'void')),
  reason text NOT NULL CHECK (length(btrim(reason)) >= 5),
  resolved_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL
);

CREATE OR REPLACE VIEW public.outreach_duplicate_candidates
WITH (security_invoker = true) AS
SELECT
  a.id AS visit_a_id, b.id AS visit_b_id, a.date,
  a.practitioner_id, a.data_capturer_id,
  (CASE WHEN a.practitioner_id IS NOT DISTINCT FROM b.practitioner_id THEN 35 ELSE 0 END
   + CASE WHEN a.data_capturer_id IS NOT DISTINCT FROM b.data_capturer_id THEN 15 ELSE 0 END
   + CASE WHEN a.outreach_type IS NOT DISTINCT FROM b.outreach_type THEN 15 ELSE 0 END
   + CASE WHEN a.parents_trained IS NOT DISTINCT FROM b.parents_trained THEN 10 ELSE 0 END
   + CASE WHEN a.children_books IS NOT DISTINCT FROM b.children_books THEN 10 ELSE 0 END
   + CASE WHEN a.transport_km IS NOT DISTINCT FROM b.transport_km THEN 5 ELSE 0 END
   + CASE WHEN a.transport_cost IS NOT DISTINCT FROM b.transport_cost THEN 5 ELSE 0 END
   + CASE WHEN a.outreach_happened IS NOT DISTINCT FROM b.outreach_happened THEN 5 ELSE 0 END) AS confidence_score,
  a.kobo_instance_id AS instance_a, b.kobo_instance_id AS instance_b
FROM public.outreach_visits a
JOIN public.outreach_visits b ON a.id < b.id AND a.date = b.date
WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
  AND a.resolution_status = 'active' AND b.resolution_status = 'active'
  AND (
    (a.practitioner_id IS NOT NULL AND a.practitioner_id = b.practitioner_id)
    OR EXISTS (
      SELECT 1 FROM public.outreach_visit_practitioners ap
      JOIN public.outreach_visit_practitioners bp ON bp.practitioner_id = ap.practitioner_id
      WHERE ap.visit_id = a.id AND bp.visit_id = b.id
    )
  );

CREATE OR REPLACE FUNCTION public.resolve_duplicate_outreach_visit(
  p_keep_id uuid,
  p_discard_id uuid,
  p_reason text,
  p_action text DEFAULT 'merge'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor uuid := auth.uid(); v_role text; v_snapshot jsonb;
BEGIN
  v_role := public.get_my_role();
  IF v_role NOT IN ('administrator', 'manager') THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED');
  END IF;
  IF p_keep_id = p_discard_id OR p_action NOT IN ('merge', 'void') OR length(btrim(coalesce(p_reason, ''))) < 5 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_REQUEST');
  END IF;
  PERFORM 1 FROM public.outreach_visits WHERE id IN (p_keep_id, p_discard_id)
    AND deleted_at IS NULL ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.outreach_visits WHERE id IN (p_keep_id, p_discard_id) AND deleted_at IS NULL) <> 2 THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  END IF;
  SELECT jsonb_build_object('keep', to_jsonb(k), 'discard', to_jsonb(d)) INTO v_snapshot
  FROM public.outreach_visits k CROSS JOIN public.outreach_visits d
  WHERE k.id = p_keep_id AND d.id = p_discard_id;

  IF p_action = 'merge' THEN
    INSERT INTO public.outreach_visit_practitioners(visit_id, practitioner_id, participation_role)
    SELECT p_keep_id, practitioner_id,
      CASE WHEN participation_role = 'primary' AND EXISTS (
        SELECT 1 FROM public.outreach_visit_practitioners WHERE visit_id = p_keep_id AND participation_role = 'primary'
      ) THEN 'additional' ELSE participation_role END
    FROM public.outreach_visit_practitioners WHERE visit_id = p_discard_id
    ON CONFLICT (visit_id, practitioner_id) DO NOTHING;
    UPDATE public.outreach_visit_sources SET visit_id = p_keep_id WHERE visit_id = p_discard_id;
  END IF;

  PERFORM set_config('app.actor_type', 'user', true);
  PERFORM set_config('app.actor_reference', v_actor::text, true);
  PERFORM set_config('app.change_reason', btrim(p_reason), true);
  PERFORM set_config('app.change_source', 'duplicate_resolution', true);
  UPDATE public.outreach_visits
  SET resolution_status = CASE WHEN p_action = 'merge' THEN 'superseded' ELSE 'void' END,
      superseded_by_id = CASE WHEN p_action = 'merge' THEN p_keep_id ELSE NULL END,
      resolution_reason = btrim(p_reason), resolved_at = now(), resolved_by = v_actor,
      deleted_at = now(), deleted_by = v_actor, delete_reason = btrim(p_reason)
  WHERE id = p_discard_id;
  INSERT INTO public.outreach_visit_resolutions(
    kept_visit_id, discarded_visit_id, action, reason, resolved_by, snapshot
  ) VALUES (p_keep_id, p_discard_id, p_action, btrim(p_reason), v_actor, v_snapshot);
  RETURN jsonb_build_object('success', true, 'kept_id', p_keep_id, 'discarded_id', p_discard_id, 'action', p_action);
END;
$$;

CREATE OR REPLACE FUNCTION public.correct_outreach_visit(
  p_visit_id uuid,
  p_changes jsonb,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor uuid := auth.uid(); v_role text;
DECLARE v_allowed text[] := ARRAY['date','practitioner_id','outreach_type','outreach_happened','did_instead','comments','parents_enrolled','parents_trained','children_books','books_per_child','books_to_practitioner','transport_type','transport_cost','transport_km'];
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
    children_books = CASE WHEN p_changes ? 'children_books' THEN (p_changes->>'children_books')::numeric ELSE children_books END,
    books_per_child = CASE WHEN p_changes ? 'books_per_child' THEN (p_changes->>'books_per_child')::numeric ELSE books_per_child END,
    books_to_practitioner = CASE WHEN p_changes ? 'books_to_practitioner' THEN (p_changes->>'books_to_practitioner')::numeric ELSE books_to_practitioner END,
    transport_type = CASE WHEN p_changes ? 'transport_type' THEN p_changes->>'transport_type' ELSE transport_type END,
    transport_cost = CASE WHEN p_changes ? 'transport_cost' THEN (p_changes->>'transport_cost')::numeric ELSE transport_cost END,
    transport_km = CASE WHEN p_changes ? 'transport_km' THEN (p_changes->>'transport_km')::numeric ELSE transport_km END,
    source = 'manual_edit'
  WHERE id = p_visit_id;
  RETURN jsonb_build_object('success', true, 'visit_id', p_visit_id);
END;
$$;

ALTER TABLE public.outreach_visit_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_visit_resolutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visit sources: reviewer read" ON public.outreach_visit_sources FOR SELECT TO authenticated
USING (public.get_my_role() IN ('administrator', 'manager'));
CREATE POLICY "visit resolutions: reviewer read" ON public.outreach_visit_resolutions FOR SELECT TO authenticated
USING (public.get_my_role() IN ('administrator', 'manager'));
REVOKE ALL ON public.outreach_visit_sources, public.outreach_visit_resolutions FROM PUBLIC, anon;
GRANT SELECT ON public.outreach_visit_sources, public.outreach_visit_resolutions TO authenticated;
GRANT ALL ON public.outreach_visit_sources, public.outreach_visit_resolutions TO service_role;
REVOKE ALL ON FUNCTION public.resolve_duplicate_outreach_visit(uuid,uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.correct_outreach_visit(uuid,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_duplicate_outreach_visit(uuid,uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.correct_outreach_visit(uuid,jsonb,text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Raw -> processed -> visible reconciliation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.kobo_reconciliation
WITH (security_invoker = true) AS
SELECT r.instance_id, r.submitted_at, r.last_received_at, r.receive_count, r.payload_hash,
  p.status AS processing_status, p.processed_at, p.attempt_count, p.error_message,
  p.warning_details, p.result_visit_id,
  v.id AS visible_visit_id, v.deleted_at AS visit_deleted_at, v.resolution_status,
  coalesce(u.unresolved_count, 0) AS unresolved_count,
  l.reason_code AS ledger_reason_code,
  CASE
    WHEN p.instance_id IS NULL THEN 'pending'
    WHEN p.status = 'failed' THEN 'failed'
    WHEN p.status IN ('quarantined', 'ignored') OR l.reason_code LIKE 'QUARANTINED_%' THEN 'quarantined'
    WHEN v.id IS NULL AND p.status IN ('success', 'partial') THEN 'missing_visible_record'
    WHEN coalesce(u.unresolved_count, 0) > 0 THEN 'unmatched'
    WHEN p.status = 'partial' THEN 'partial'
    WHEN v.id IS NOT NULL AND v.deleted_at IS NULL AND v.resolution_status = 'active' THEN 'visible'
    ELSE 'resolved'
  END AS reconciliation_state,
  CASE
    WHEN p.instance_id IS NULL OR p.status IN ('failed', 'partial') OR coalesce(u.unresolved_count, 0) > 0
      OR (v.id IS NULL AND p.status IN ('success', 'partial')) THEN true ELSE false
  END AS action_required
FROM public.kobo_raw_submissions r
LEFT JOIN public.kobo_processed p ON p.instance_id = r.instance_id
LEFT JOIN public.outreach_visits v ON v.kobo_instance_id = r.instance_id
LEFT JOIN LATERAL (
  SELECT count(*)::integer AS unresolved_count FROM public.kobo_unmatched ku
  WHERE ku.instance_id = r.instance_id AND ku.resolved_at IS NULL
) u ON true
LEFT JOIN public.kobo_resolution_ledger l ON l.source_identity = r.instance_id;

GRANT SELECT ON public.kobo_reconciliation, public.outreach_duplicate_candidates TO authenticated, service_role;

-- Correct the one known malformed ECDC name only when it deterministically names
-- another active ECDC. Preserve links and archive the erroneous duplicate.
DO $$
DECLARE v_bad uuid; v_keep uuid;
BEGIN
  SELECT bad.id, target.id INTO v_bad, v_keep
  FROM public.ecdc_list bad
  JOIN public.ecdc_list target ON lower(bad.name) = lower(target.id::text) AND bad.id <> target.id
  WHERE bad.deleted_at IS NULL AND target.deleted_at IS NULL
  ORDER BY bad.id LIMIT 1;
  IF v_bad IS NOT NULL THEN
    PERFORM set_config('app.actor_type', 'system', true);
    PERFORM set_config('app.actor_reference', 'phase2-migration', true);
    PERFORM set_config('app.change_reason', 'Deterministic UUID-like name correction', true);
    PERFORM set_config('app.change_source', 'migration', true);
    UPDATE public.practitioners SET ecdc_id = v_keep WHERE ecdc_id = v_bad;
    UPDATE public.ecdc_list SET deleted_at = now(), delete_reason = 'Phase 2: UUID-like duplicate ECDC linked to canonical record'
    WHERE id = v_bad;
    INSERT INTO public.audit_logs(
      table_name, record_id, changed_fields, changed_by_id,
      actor_type, actor_reference, change_reason, source
    )
    VALUES ('ecdc_list', v_bad, jsonb_build_object(
      'deleted_at', jsonb_build_object('old', NULL, 'new', now()),
      'merged_into', jsonb_build_object('old', NULL, 'new', v_keep),
      'reason', jsonb_build_object('old', NULL, 'new', 'Deterministic UUID-like name correction')
    ), NULL, 'system', 'phase2-migration', 'Deterministic UUID-like name correction', 'migration');
  END IF;
END;
$$;

ALTER TABLE public.ecdc_list
  ADD CONSTRAINT ecdc_name_not_identifier_check CHECK (
    name IS NULL OR NOT (
      name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR name ~* '^[0-9a-f]{32}$'
    )
  ) NOT VALID;

ALTER TABLE public.kobo_processing_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "processing attempts: reviewer read" ON public.kobo_processing_attempts FOR SELECT TO authenticated
USING (public.get_my_role() IN ('administrator', 'manager'));
REVOKE ALL ON public.kobo_processing_attempts FROM PUBLIC, anon;
GRANT SELECT ON public.kobo_processing_attempts TO authenticated;
GRANT ALL ON public.kobo_processing_attempts TO service_role;
