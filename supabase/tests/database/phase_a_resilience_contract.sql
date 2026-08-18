\set ON_ERROR_STOP on

BEGIN;

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id) VALUES
  ('00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-8000-0000000000a3'),
  ('00000000-0000-4000-8000-0000000000a4'),
  ('00000000-0000-4000-8000-0000000000a5'),
  ('00000000-0000-4000-8000-0000000000a6'),
  ('00000000-0000-4000-8000-0000000000a7')
ON CONFLICT (id) DO NOTHING;
SET LOCAL session_replication_role = origin;

INSERT INTO public.layita_staff (id, name) VALUES
  ('00000000-0000-4000-8000-0000000000b1', 'Phase A administrator'),
  ('00000000-0000-4000-8000-0000000000b2', 'Phase A manager'),
  ('00000000-0000-4000-8000-0000000000b3', 'Phase A capturer'),
  ('00000000-0000-4000-8000-0000000000b4', 'Phase A other staff')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, name, email, role, layita_staff_id, is_active) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'Phase A administrator', 'phase-a-admin@example.invalid', 'administrator', '00000000-0000-4000-8000-0000000000b1', true),
  ('00000000-0000-4000-8000-0000000000a2', 'Phase A manager', 'phase-a-manager@example.invalid', 'manager', '00000000-0000-4000-8000-0000000000b2', true),
  ('00000000-0000-4000-8000-0000000000a3', 'Phase A capturer', 'phase-a-capturer@example.invalid', 'datacapturer', '00000000-0000-4000-8000-0000000000b3', true),
  ('00000000-0000-4000-8000-0000000000a4', 'Phase A library', 'phase-a-library@example.invalid', 'library', NULL, true),
  ('00000000-0000-4000-8000-0000000000a5', 'Phase A inactive', 'phase-a-inactive@example.invalid', 'administrator', NULL, false),
  ('00000000-0000-4000-8000-0000000000a7', 'Phase A unlinked', 'phase-a-unlinked@example.invalid', 'datacapturer', NULL, true)
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, layita_staff_id = EXCLUDED.layita_staff_id, is_active = EXCLUDED.is_active;

DO $$
DECLARE
  v_result jsonb;
  v_error_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
  IF public.get_my_role() <> 'administrator' THEN RAISE EXCEPTION 'Administrator role was not resolved'; END IF;
  v_error_id := public.record_client_error(
    '11111111-1111-4111-8111-111111111111', 'phase_a_fixture', 'Expected fixture error', '/fixture', '{"safe":true}'
  );
  IF NOT EXISTS (SELECT 1 FROM public.client_error_reports WHERE id = v_error_id) THEN
    RAISE EXCEPTION 'Authenticated diagnostic was not stored';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
  v_result := public.hard_delete_outreach_visit(gen_random_uuid());
  IF v_result->>'code' <> 'UNAUTHORIZED' THEN RAISE EXCEPTION 'Manager was allowed to hard-delete'; END IF;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a5', true);
  IF public.get_my_role() IS NOT NULL THEN RAISE EXCEPTION 'Inactive profile retained an application role'; END IF;
  BEGIN
    PERFORM public.record_client_error('11111111-1111-4111-8111-111111111111', 'fixture', 'inactive', NULL, '{}');
    RAISE EXCEPTION 'Inactive user stored diagnostics';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a6', true);
  IF public.get_my_role() IS NOT NULL THEN RAISE EXCEPTION 'Missing profile received an application role'; END IF;
END;
$$;

SET LOCAL ROLE authenticated;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a3', true);
  INSERT INTO public.outreach_visits (date, data_capturer_id, outreach_type, source)
  VALUES (current_date, '00000000-0000-4000-8000-0000000000b3', 'support', 'manual');

  BEGIN
    INSERT INTO public.outreach_visits (date, data_capturer_id, outreach_type, source)
    VALUES (current_date, '00000000-0000-4000-8000-0000000000b4', 'support', 'manual');
    RAISE EXCEPTION 'Data capturer inserted a visit for another staff member';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.outreach_visits (date, data_capturer_id, outreach_type, source)
    VALUES (current_date, '00000000-0000-4000-8000-0000000000b3', 'support', 'kobo');
    RAISE EXCEPTION 'Data capturer inserted a Kobo-sourced visit';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a4', true);
  BEGIN
    INSERT INTO public.outreach_visits (date, outreach_type, source)
    VALUES (current_date, 'support', 'manual');
    RAISE EXCEPTION 'Library user inserted a visit';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a7', true);
  BEGIN
    INSERT INTO public.outreach_visits (date, outreach_type, source)
    VALUES (current_date, 'support', 'manual');
    RAISE EXCEPTION 'Unlinked data capturer inserted a visit';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;
ROLLBACK;
