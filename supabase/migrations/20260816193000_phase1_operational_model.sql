-- Phase 1: establish the durable operational model before restoring RPC contracts.
-- This migration is additive and compatibility-first: legacy columns remain available
-- while normalized training, lifecycle, visit-participant, metric, and leader models
-- become the canonical targets for new work.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- Compatibility repairs required by the current frontend
-- ---------------------------------------------------------------------------

ALTER TABLE public.planned_visits
  ALTER COLUMN assigned_to DROP NOT NULL;

ALTER TABLE public.training
  ADD COLUMN IF NOT EXISTS smart_start_date date,
  ADD COLUMN IF NOT EXISTS first_aid_date date,
  ADD COLUMN IF NOT EXISTS level4_date date,
  ADD COLUMN IF NOT EXISTS level5_date date,
  ADD COLUMN IF NOT EXISTS wordworks03_date date,
  ADD COLUMN IF NOT EXISTS wordworks35_date date,
  ADD COLUMN IF NOT EXISTS littlestars_date date,
  ADD COLUMN IF NOT EXISTS other_date date;

-- number_children remains text for API compatibility, but is constrained and
-- exposed as an integer generated column for new code.
ALTER TABLE public.ecdc_list
  ADD CONSTRAINT ecdc_list_number_children_numeric_check
  CHECK (
    number_children IS NULL
    OR nullif(pg_catalog.btrim(number_children), '') IS NULL
    OR pg_catalog.btrim(number_children) ~ '^[0-9]+$'
  ) NOT VALID;

ALTER TABLE public.ecdc_list
  VALIDATE CONSTRAINT ecdc_list_number_children_numeric_check;

ALTER TABLE public.ecdc_list
  ADD COLUMN IF NOT EXISTS number_children_count integer
  GENERATED ALWAYS AS (
    CASE
      WHEN nullif(pg_catalog.btrim(number_children), '') IS NULL THEN NULL
      ELSE pg_catalog.btrim(number_children)::integer
    END
  ) STORED;

ALTER TABLE public.ecdc_list
  ADD CONSTRAINT ecdc_list_longitude_check
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180) NOT VALID,
  ADD CONSTRAINT ecdc_list_latitude_check
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90) NOT VALID;

ALTER TABLE public.ecdc_list VALIDATE CONSTRAINT ecdc_list_longitude_check;
ALTER TABLE public.ecdc_list VALIDATE CONSTRAINT ecdc_list_latitude_check;

ALTER TABLE public.outreach_visits
  ADD CONSTRAINT outreach_visits_parents_trained_nonnegative
    CHECK (parents_trained IS NULL OR parents_trained >= 0) NOT VALID,
  ADD CONSTRAINT outreach_visits_parents_enrolled_nonnegative
    CHECK (parents_enrolled IS NULL OR parents_enrolled >= 0) NOT VALID,
  ADD CONSTRAINT outreach_visits_children_books_nonnegative
    CHECK (children_books IS NULL OR children_books >= 0) NOT VALID,
  ADD CONSTRAINT outreach_visits_books_per_child_nonnegative
    CHECK (books_per_child IS NULL OR books_per_child >= 0) NOT VALID,
  ADD CONSTRAINT outreach_visits_books_to_practitioner_nonnegative
    CHECK (books_to_practitioner IS NULL OR books_to_practitioner >= 0) NOT VALID;

ALTER TABLE public.outreach_visits VALIDATE CONSTRAINT outreach_visits_parents_trained_nonnegative;
ALTER TABLE public.outreach_visits VALIDATE CONSTRAINT outreach_visits_parents_enrolled_nonnegative;
ALTER TABLE public.outreach_visits VALIDATE CONSTRAINT outreach_visits_children_books_nonnegative;
ALTER TABLE public.outreach_visits VALIDATE CONSTRAINT outreach_visits_books_per_child_nonnegative;
ALTER TABLE public.outreach_visits VALIDATE CONSTRAINT outreach_visits_books_to_practitioner_nonnegative;

-- Preserve outreach history when a practitioner is permanently removed.
ALTER TABLE public.outreach_visits
  DROP CONSTRAINT IF EXISTS outreach_visits_practitioner_id_fkey;
ALTER TABLE public.outreach_visits
  ADD CONSTRAINT outreach_visits_practitioner_id_fkey
  FOREIGN KEY (practitioner_id) REFERENCES public.practitioners(id)
  ON UPDATE CASCADE ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Explicit profile/staff identity
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS layita_staff_id uuid;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_layita_staff_id_fkey
  FOREIGN KEY (layita_staff_id) REFERENCES public.layita_staff(id)
  ON UPDATE CASCADE ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_layita_staff_id_key
  ON public.profiles (layita_staff_id)
  WHERE layita_staff_id IS NOT NULL;

WITH unambiguous_matches AS (
  SELECT p.id AS profile_id, (array_agg(s.id ORDER BY s.id))[1] AS staff_id
  FROM public.profiles p
  JOIN public.layita_staff s ON pg_catalog.lower(pg_catalog.btrim(s.name)) = pg_catalog.lower(pg_catalog.btrim(p.name))
  WHERE p.layita_staff_id IS NULL
  GROUP BY p.id
  HAVING count(*) = 1
)
UPDATE public.profiles p
SET layita_staff_id = m.staff_id
FROM unambiguous_matches m
WHERE p.id = m.profile_id;

-- ---------------------------------------------------------------------------
-- Normalized, repeatable training history
-- ---------------------------------------------------------------------------

CREATE TABLE public.training_courses (
  code text PRIMARY KEY,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_courses_code_check CHECK (code ~ '^[a-z0-9_]+$'),
  CONSTRAINT training_courses_name_check CHECK (nullif(pg_catalog.btrim(name), '') IS NOT NULL)
);

INSERT INTO public.training_courses (code, name)
VALUES
  ('smart_start', 'SmartStart'),
  ('first_aid', 'First Aid'),
  ('level4', 'ECD Level 4'),
  ('level5', 'ECD Level 5'),
  ('wordworks03', 'Wordworks 0–3'),
  ('wordworks35', 'Wordworks 3–5'),
  ('littlestars', 'Little Stars'),
  ('other', 'Other')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

CREATE TABLE public.training_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id uuid NOT NULL REFERENCES public.practitioners(id) ON UPDATE CASCADE ON DELETE CASCADE,
  course_code text NOT NULL REFERENCES public.training_courses(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  completed_on date,
  provider text,
  notes text,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_id uuid REFERENCES public.profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT training_events_source_check CHECK (source IN ('legacy', 'manual', 'kobo', 'import')),
  CONSTRAINT training_events_unique_completion UNIQUE NULLS NOT DISTINCT (practitioner_id, course_code, completed_on)
);

CREATE INDEX training_events_practitioner_date_idx
  ON public.training_events (practitioner_id, completed_on DESC);
CREATE INDEX training_events_course_date_idx
  ON public.training_events (course_code, completed_on DESC);

INSERT INTO public.training_events (practitioner_id, course_code, completed_on, notes, source)
SELECT t.id, v.course_code, v.completed_on, v.notes, 'legacy'
FROM public.training t
CROSS JOIN LATERAL (
  VALUES
    ('smart_start'::text, t.smart_start_date, NULL::text, coalesce(t.smart_start_ever, false)),
    ('first_aid', t.first_aid_date, NULL, coalesce(t.first_aid_ever, false)),
    ('level4', t.level4_date, NULL, coalesce(t.level4_ever, false)),
    ('level5', t.level5_date, NULL, coalesce(t.level5_ever, false)),
    ('wordworks03', t.wordworks03_date, NULL, coalesce(t.wordworks03_ever, false)),
    ('wordworks35', t.wordworks35_date, NULL, coalesce(t.wordworks35_ever, false)),
    ('littlestars', t.littlestars_date, NULL, coalesce(t.littlestars_ever, false)),
    ('other', t.other_date, nullif(pg_catalog.btrim(t.other), ''), nullif(pg_catalog.btrim(t.other), '') IS NOT NULL)
) AS v(course_code, completed_on, notes, attended)
WHERE v.attended
ON CONFLICT (practitioner_id, course_code, completed_on)
DO UPDATE SET notes = coalesce(public.training_events.notes, EXCLUDED.notes);

CREATE OR REPLACE FUNCTION public.sync_legacy_training_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event record;
BEGIN
  FOR v_event IN
    SELECT *
    FROM (VALUES
      ('smart_start'::text, NEW.smart_start_date, NULL::text, coalesce(NEW.smart_start_ever, false)),
      ('first_aid', NEW.first_aid_date, NULL, coalesce(NEW.first_aid_ever, false)),
      ('level4', NEW.level4_date, NULL, coalesce(NEW.level4_ever, false)),
      ('level5', NEW.level5_date, NULL, coalesce(NEW.level5_ever, false)),
      ('wordworks03', NEW.wordworks03_date, NULL, coalesce(NEW.wordworks03_ever, false)),
      ('wordworks35', NEW.wordworks35_date, NULL, coalesce(NEW.wordworks35_ever, false)),
      ('littlestars', NEW.littlestars_date, NULL, coalesce(NEW.littlestars_ever, false)),
      ('other', NEW.other_date, nullif(pg_catalog.btrim(NEW.other), ''), nullif(pg_catalog.btrim(NEW.other), '') IS NOT NULL)
    ) AS events(course_code, completed_on, notes, attended)
  LOOP
    IF v_event.attended THEN
      IF v_event.completed_on IS NULL AND EXISTS (
        SELECT 1 FROM public.training_events te
        WHERE te.practitioner_id = NEW.id AND te.course_code = v_event.course_code
      ) THEN
        CONTINUE;
      END IF;

      INSERT INTO public.training_events
        (practitioner_id, course_code, completed_on, notes, source, created_by_id)
      VALUES (NEW.id, v_event.course_code, v_event.completed_on, v_event.notes, 'legacy', auth.uid())
      ON CONFLICT (practitioner_id, course_code, completed_on)
      DO UPDATE SET notes = coalesce(public.training_events.notes, EXCLUDED.notes);

      IF v_event.completed_on IS NOT NULL THEN
        DELETE FROM public.training_events te
        WHERE te.practitioner_id = NEW.id
          AND te.course_code = v_event.course_code
          AND te.completed_on IS NULL;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS training_sync_legacy_events ON public.training;
CREATE TRIGGER training_sync_legacy_events
AFTER INSERT OR UPDATE ON public.training
FOR EACH ROW EXECUTE FUNCTION public.sync_legacy_training_events();

-- ---------------------------------------------------------------------------
-- Practitioner lifecycle and group history
-- ---------------------------------------------------------------------------

UPDATE public.practitioners SET status = 'active' WHERE status IS NULL;
ALTER TABLE public.practitioners ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE public.practitioners ALTER COLUMN status SET NOT NULL;

CREATE TABLE public.practitioner_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id uuid NOT NULL REFERENCES public.practitioners(id) ON UPDATE CASCADE ON DELETE CASCADE,
  status text NOT NULL,
  reason text,
  comment text,
  effective_on date NOT NULL DEFAULT current_date,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by_id uuid REFERENCES public.profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual',
  CONSTRAINT practitioner_lifecycle_status_check CHECK (status IN ('active', 'inactive', 'interested')),
  CONSTRAINT practitioner_lifecycle_source_check CHECK (source IN ('baseline', 'manual', 'merge', 'import'))
);

CREATE INDEX practitioner_lifecycle_practitioner_date_idx
  ON public.practitioner_lifecycle_events (practitioner_id, effective_on DESC, changed_at DESC);

CREATE TABLE public.practitioner_group_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id uuid NOT NULL REFERENCES public.practitioners(id) ON UPDATE CASCADE ON DELETE CASCADE,
  group_id uuid REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE SET NULL,
  group_name text,
  started_on date NOT NULL DEFAULT current_date,
  ended_on date,
  reason text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by_id uuid REFERENCES public.profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT practitioner_group_history_dates_check CHECK (ended_on IS NULL OR ended_on >= started_on)
);

CREATE UNIQUE INDEX practitioner_group_history_current_key
  ON public.practitioner_group_history (practitioner_id)
  WHERE ended_on IS NULL;

INSERT INTO public.practitioner_lifecycle_events (practitioner_id, status, effective_on, source)
SELECT p.id, p.status, coalesce(p.created_at::date, current_date), 'baseline'
FROM public.practitioners p;

INSERT INTO public.practitioner_group_history (practitioner_id, group_id, group_name, started_on)
SELECT p.id, p.group_id, coalesce(g.group_name, p."group"), coalesce(p.created_at::date, current_date)
FROM public.practitioners p
LEFT JOIN public.groups g ON g.id = p.group_id
WHERE p.group_id IS NOT NULL OR nullif(pg_catalog.btrim(p."group"), '') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_practitioner_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_group_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.practitioner_lifecycle_events
      (practitioner_id, status, effective_on, changed_by_id, source)
    VALUES (NEW.id, NEW.status, current_date, auth.uid(), 'manual');

    IF NEW.group_id IS NOT NULL OR nullif(pg_catalog.btrim(NEW."group"), '') IS NOT NULL THEN
      SELECT g.group_name INTO v_group_name FROM public.groups g WHERE g.id = NEW.group_id;
      INSERT INTO public.practitioner_group_history
        (practitioner_id, group_id, group_name, started_on, changed_by_id)
      VALUES (NEW.id, NEW.group_id, coalesce(v_group_name, NEW."group"), current_date, auth.uid());
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.practitioner_lifecycle_events
      (practitioner_id, status, effective_on, changed_by_id, source)
    VALUES (NEW.id, NEW.status, current_date, auth.uid(), 'manual');
  END IF;

  IF NEW.group_id IS DISTINCT FROM OLD.group_id OR NEW."group" IS DISTINCT FROM OLD."group" THEN
    UPDATE public.practitioner_group_history
    SET ended_on = current_date,
        changed_at = now(),
        changed_by_id = auth.uid()
    WHERE practitioner_id = NEW.id AND ended_on IS NULL;

    IF NEW.group_id IS NOT NULL OR nullif(pg_catalog.btrim(NEW."group"), '') IS NOT NULL THEN
      SELECT g.group_name INTO v_group_name FROM public.groups g WHERE g.id = NEW.group_id;
      INSERT INTO public.practitioner_group_history
        (practitioner_id, group_id, group_name, started_on, changed_by_id)
      VALUES (NEW.id, NEW.group_id, coalesce(v_group_name, NEW."group"), current_date, auth.uid());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS practitioners_record_history ON public.practitioners;
CREATE TRIGGER practitioners_record_history
AFTER INSERT OR UPDATE OF status, group_id, "group" ON public.practitioners
FOR EACH ROW EXECUTE FUNCTION public.record_practitioner_history();

-- ---------------------------------------------------------------------------
-- Multiple practitioners per outreach visit
-- ---------------------------------------------------------------------------

CREATE TABLE public.outreach_visit_practitioners (
  visit_id uuid NOT NULL REFERENCES public.outreach_visits(id) ON UPDATE CASCADE ON DELETE CASCADE,
  practitioner_id uuid NOT NULL REFERENCES public.practitioners(id) ON UPDATE CASCADE ON DELETE CASCADE,
  participation_role text NOT NULL DEFAULT 'primary',
  was_planned boolean,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (visit_id, practitioner_id),
  CONSTRAINT outreach_visit_practitioners_role_check
    CHECK (participation_role IN ('primary', 'additional'))
);

CREATE UNIQUE INDEX outreach_visit_practitioners_one_primary_idx
  ON public.outreach_visit_practitioners (visit_id)
  WHERE participation_role = 'primary';
CREATE INDEX outreach_visit_practitioners_practitioner_idx
  ON public.outreach_visit_practitioners (practitioner_id, visit_id);

INSERT INTO public.outreach_visit_practitioners (visit_id, practitioner_id, participation_role)
SELECT id, practitioner_id, 'primary'
FROM public.outreach_visits
WHERE practitioner_id IS NOT NULL
ON CONFLICT (visit_id, practitioner_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_visit_primary_practitioner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.practitioner_id IS NOT DISTINCT FROM OLD.practitioner_id THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.outreach_visit_practitioners
  WHERE visit_id = NEW.id AND participation_role = 'primary';

  IF NEW.practitioner_id IS NOT NULL THEN
    INSERT INTO public.outreach_visit_practitioners (visit_id, practitioner_id, participation_role)
    VALUES (NEW.id, NEW.practitioner_id, 'primary')
    ON CONFLICT (visit_id, practitioner_id)
    DO UPDATE SET participation_role = 'primary';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS outreach_visits_sync_primary_practitioner ON public.outreach_visits;
CREATE TRIGGER outreach_visits_sync_primary_practitioner
AFTER INSERT OR UPDATE OF practitioner_id ON public.outreach_visits
FOR EACH ROW EXECUTE FUNCTION public.sync_visit_primary_practitioner();

-- ---------------------------------------------------------------------------
-- Unambiguous outreach metrics with legacy-column synchronization
-- ---------------------------------------------------------------------------

ALTER TABLE public.outreach_visits
  ADD COLUMN IF NOT EXISTS parents_attending numeric,
  ADD COLUMN IF NOT EXISTS children_receiving_books numeric,
  ADD COLUMN IF NOT EXISTS books_distributed_to_children numeric,
  ADD COLUMN IF NOT EXISTS books_left_with_practitioner numeric,
  ADD COLUMN IF NOT EXISTS photos_uploaded_to_album boolean,
  ADD COLUMN IF NOT EXISTS photo_album_url text;

UPDATE public.outreach_visits
SET parents_attending = coalesce(parents_attending, parents_trained),
    children_receiving_books = coalesce(children_receiving_books, children_books),
    books_distributed_to_children = coalesce(
      books_distributed_to_children,
      CASE
        WHEN children_books IS NOT NULL AND books_per_child IS NOT NULL
          THEN children_books * books_per_child
        ELSE NULL
      END
    ),
    books_left_with_practitioner = coalesce(books_left_with_practitioner, books_to_practitioner),
    photos_uploaded_to_album = coalesce(photos_uploaded_to_album, photos_taken);

ALTER TABLE public.outreach_visits
  ADD COLUMN IF NOT EXISTS attendance_rate_percent numeric
  GENERATED ALWAYS AS (
    CASE
      WHEN parents_enrolled > 0 AND parents_attending IS NOT NULL
        THEN pg_catalog.round((parents_attending / parents_enrolled) * 100, 2)
      ELSE NULL
    END
  ) STORED,
  ADD CONSTRAINT outreach_visits_parents_attending_nonnegative
    CHECK (parents_attending IS NULL OR parents_attending >= 0),
  ADD CONSTRAINT outreach_visits_children_receiving_books_nonnegative
    CHECK (children_receiving_books IS NULL OR children_receiving_books >= 0),
  ADD CONSTRAINT outreach_visits_books_distributed_nonnegative
    CHECK (books_distributed_to_children IS NULL OR books_distributed_to_children >= 0),
  ADD CONSTRAINT outreach_visits_books_left_nonnegative
    CHECK (books_left_with_practitioner IS NULL OR books_left_with_practitioner >= 0),
  ADD CONSTRAINT outreach_visits_attendance_bounds
    CHECK (parents_attending IS NULL OR parents_enrolled IS NULL OR parents_attending <= parents_enrolled);

CREATE OR REPLACE FUNCTION public.sync_outreach_metric_compatibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.parents_attending := coalesce(NEW.parents_attending, NEW.parents_trained);
    NEW.parents_trained := coalesce(NEW.parents_trained, NEW.parents_attending);
    NEW.children_receiving_books := coalesce(NEW.children_receiving_books, NEW.children_books);
    NEW.children_books := coalesce(NEW.children_books, NEW.children_receiving_books);
    NEW.books_distributed_to_children := coalesce(
      NEW.books_distributed_to_children,
      CASE WHEN NEW.children_books IS NOT NULL AND NEW.books_per_child IS NOT NULL
        THEN NEW.children_books * NEW.books_per_child END
    );
    NEW.books_left_with_practitioner := coalesce(NEW.books_left_with_practitioner, NEW.books_to_practitioner);
    NEW.books_to_practitioner := coalesce(NEW.books_to_practitioner, NEW.books_left_with_practitioner);
    NEW.photos_uploaded_to_album := coalesce(NEW.photos_uploaded_to_album, NEW.photos_taken);
    RETURN NEW;
  END IF;

  IF NEW.parents_attending IS DISTINCT FROM OLD.parents_attending THEN
    NEW.parents_trained := NEW.parents_attending;
  ELSIF NEW.parents_trained IS DISTINCT FROM OLD.parents_trained THEN
    NEW.parents_attending := NEW.parents_trained;
  END IF;

  IF NEW.children_receiving_books IS DISTINCT FROM OLD.children_receiving_books THEN
    NEW.children_books := NEW.children_receiving_books;
  ELSIF NEW.children_books IS DISTINCT FROM OLD.children_books THEN
    NEW.children_receiving_books := NEW.children_books;
  END IF;

  IF NEW.books_left_with_practitioner IS DISTINCT FROM OLD.books_left_with_practitioner THEN
    NEW.books_to_practitioner := NEW.books_left_with_practitioner;
  ELSIF NEW.books_to_practitioner IS DISTINCT FROM OLD.books_to_practitioner THEN
    NEW.books_left_with_practitioner := NEW.books_to_practitioner;
  END IF;

  IF NEW.photos_uploaded_to_album IS DISTINCT FROM OLD.photos_uploaded_to_album THEN
    NEW.photos_taken := NEW.photos_uploaded_to_album;
  ELSIF NEW.photos_taken IS DISTINCT FROM OLD.photos_taken THEN
    NEW.photos_uploaded_to_album := NEW.photos_taken;
  END IF;

  IF NEW.children_books IS DISTINCT FROM OLD.children_books
     OR NEW.books_per_child IS DISTINCT FROM OLD.books_per_child THEN
    NEW.books_distributed_to_children := CASE
      WHEN NEW.children_books IS NOT NULL AND NEW.books_per_child IS NOT NULL
        THEN NEW.children_books * NEW.books_per_child
      ELSE NEW.books_distributed_to_children
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS outreach_visits_sync_metric_compatibility ON public.outreach_visits;
CREATE TRIGGER outreach_visits_sync_metric_compatibility
BEFORE INSERT OR UPDATE ON public.outreach_visits
FOR EACH ROW EXECUTE FUNCTION public.sync_outreach_metric_compatibility();

CREATE INDEX IF NOT EXISTS outreach_visits_active_date_idx
  ON public.outreach_visits (date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS outreach_visits_practitioner_date_idx
  ON public.outreach_visits (practitioner_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS planned_visits_assignee_status_date_idx
  ON public.planned_visits (assigned_to, status, scheduled_date);
CREATE INDEX IF NOT EXISTS practitioners_active_name_idx
  ON public.practitioners (name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ecdc_list_active_name_idx
  ON public.ecdc_list (name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS kobo_unmatched_open_created_idx
  ON public.kobo_unmatched (created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS audit_logs_changed_at_idx
  ON public.audit_logs (changed_at DESC);

-- ---------------------------------------------------------------------------
-- Controlled chief/headman references while retaining submitted text
-- ---------------------------------------------------------------------------

CREATE TABLE public.traditional_leaders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_type text NOT NULL,
  canonical_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  needs_review boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_id uuid REFERENCES public.profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT traditional_leaders_type_check CHECK (leader_type IN ('chief', 'headman')),
  CONSTRAINT traditional_leaders_name_check CHECK (nullif(pg_catalog.btrim(canonical_name), '') IS NOT NULL)
);

CREATE UNIQUE INDEX traditional_leaders_type_name_key
  ON public.traditional_leaders (leader_type, pg_catalog.lower(pg_catalog.btrim(canonical_name)));

CREATE TABLE public.traditional_leader_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id uuid NOT NULL REFERENCES public.traditional_leaders(id) ON UPDATE CASCADE ON DELETE CASCADE,
  leader_type text NOT NULL,
  alias text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT traditional_leader_aliases_type_check CHECK (leader_type IN ('chief', 'headman')),
  CONSTRAINT traditional_leader_aliases_alias_check CHECK (nullif(pg_catalog.btrim(alias), '') IS NOT NULL)
);

CREATE UNIQUE INDEX traditional_leader_aliases_type_alias_key
  ON public.traditional_leader_aliases (leader_type, pg_catalog.lower(pg_catalog.btrim(alias)));

INSERT INTO public.traditional_leaders (leader_type, canonical_name, needs_review)
SELECT source.leader_type, source.raw_name, true
FROM (
  SELECT DISTINCT 'chief'::text AS leader_type, pg_catalog.btrim(chief) AS raw_name
  FROM public.ecdc_list WHERE nullif(pg_catalog.btrim(chief), '') IS NOT NULL
  UNION
  SELECT DISTINCT 'headman', pg_catalog.btrim(headman)
  FROM public.ecdc_list WHERE nullif(pg_catalog.btrim(headman), '') IS NOT NULL
) source
ON CONFLICT DO NOTHING;

INSERT INTO public.traditional_leader_aliases (leader_id, leader_type, alias)
SELECT l.id, l.leader_type, l.canonical_name
FROM public.traditional_leaders l
ON CONFLICT DO NOTHING;

ALTER TABLE public.ecdc_list
  ADD COLUMN IF NOT EXISTS chief_id uuid,
  ADD COLUMN IF NOT EXISTS headman_id uuid;

ALTER TABLE public.ecdc_list
  ADD CONSTRAINT ecdc_list_chief_id_fkey
    FOREIGN KEY (chief_id) REFERENCES public.traditional_leaders(id) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD CONSTRAINT ecdc_list_headman_id_fkey
    FOREIGN KEY (headman_id) REFERENCES public.traditional_leaders(id) ON UPDATE CASCADE ON DELETE SET NULL;

UPDATE public.ecdc_list e
SET chief_id = a.leader_id
FROM public.traditional_leader_aliases a
WHERE a.leader_type = 'chief'
  AND pg_catalog.lower(pg_catalog.btrim(a.alias)) = pg_catalog.lower(pg_catalog.btrim(e.chief));

UPDATE public.ecdc_list e
SET headman_id = a.leader_id
FROM public.traditional_leader_aliases a
WHERE a.leader_type = 'headman'
  AND pg_catalog.lower(pg_catalog.btrim(a.alias)) = pg_catalog.lower(pg_catalog.btrim(e.headman));

CREATE INDEX ecdc_list_chief_id_idx ON public.ecdc_list (chief_id);
CREATE INDEX ecdc_list_headman_id_idx ON public.ecdc_list (headman_id);

CREATE OR REPLACE FUNCTION public.sync_ecdc_leader_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.chief_id IS NOT NULL THEN
      SELECT l.canonical_name INTO NEW.chief
      FROM public.traditional_leaders l
      WHERE l.id = NEW.chief_id AND l.leader_type = 'chief';
      IF NOT FOUND THEN RAISE EXCEPTION 'chief_id must reference a chief'; END IF;
    ELSIF nullif(pg_catalog.btrim(NEW.chief), '') IS NOT NULL THEN
      SELECT a.leader_id INTO NEW.chief_id
      FROM public.traditional_leader_aliases a
      WHERE a.leader_type = 'chief'
        AND pg_catalog.lower(pg_catalog.btrim(a.alias)) = pg_catalog.lower(pg_catalog.btrim(NEW.chief));
    END IF;
  ELSIF NEW.chief_id IS DISTINCT FROM OLD.chief_id THEN
    IF NEW.chief_id IS NOT NULL THEN
      SELECT l.canonical_name INTO NEW.chief
      FROM public.traditional_leaders l
      WHERE l.id = NEW.chief_id AND l.leader_type = 'chief';
      IF NOT FOUND THEN RAISE EXCEPTION 'chief_id must reference a chief'; END IF;
    END IF;
  ELSIF NEW.chief IS DISTINCT FROM OLD.chief THEN
    SELECT a.leader_id INTO NEW.chief_id
    FROM public.traditional_leader_aliases a
    WHERE a.leader_type = 'chief'
      AND pg_catalog.lower(pg_catalog.btrim(a.alias)) = pg_catalog.lower(pg_catalog.btrim(NEW.chief));
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.headman_id IS NOT NULL THEN
      SELECT l.canonical_name INTO NEW.headman
      FROM public.traditional_leaders l
      WHERE l.id = NEW.headman_id AND l.leader_type = 'headman';
      IF NOT FOUND THEN RAISE EXCEPTION 'headman_id must reference a headman'; END IF;
    ELSIF nullif(pg_catalog.btrim(NEW.headman), '') IS NOT NULL THEN
      SELECT a.leader_id INTO NEW.headman_id
      FROM public.traditional_leader_aliases a
      WHERE a.leader_type = 'headman'
        AND pg_catalog.lower(pg_catalog.btrim(a.alias)) = pg_catalog.lower(pg_catalog.btrim(NEW.headman));
    END IF;
  ELSIF NEW.headman_id IS DISTINCT FROM OLD.headman_id THEN
    IF NEW.headman_id IS NOT NULL THEN
      SELECT l.canonical_name INTO NEW.headman
      FROM public.traditional_leaders l
      WHERE l.id = NEW.headman_id AND l.leader_type = 'headman';
      IF NOT FOUND THEN RAISE EXCEPTION 'headman_id must reference a headman'; END IF;
    END IF;
  ELSIF NEW.headman IS DISTINCT FROM OLD.headman THEN
    SELECT a.leader_id INTO NEW.headman_id
    FROM public.traditional_leader_aliases a
    WHERE a.leader_type = 'headman'
      AND pg_catalog.lower(pg_catalog.btrim(a.alias)) = pg_catalog.lower(pg_catalog.btrim(NEW.headman));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ecdc_list_sync_leader_references ON public.ecdc_list;
CREATE TRIGGER ecdc_list_sync_leader_references
BEFORE INSERT OR UPDATE OF chief, chief_id, headman, headman_id ON public.ecdc_list
FOR EACH ROW EXECUTE FUNCTION public.sync_ecdc_leader_references();
