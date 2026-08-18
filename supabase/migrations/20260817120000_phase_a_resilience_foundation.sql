-- Capture Phase A: fail-closed roles and lightweight first-party diagnostics.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SELECT pg_catalog.set_config('search_path', '', false);

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.role
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.is_active = true;
$$;

CREATE TABLE public.client_error_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  correlation_id text NOT NULL,
  event text NOT NULL,
  message text NOT NULL,
  route text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT client_error_reports_correlation_check
    CHECK (correlation_id ~ '^[0-9a-fA-F-]{36}$'),
  CONSTRAINT client_error_reports_event_check
    CHECK (length(event) BETWEEN 1 AND 120),
  CONSTRAINT client_error_reports_message_check
    CHECK (length(message) BETWEEN 1 AND 2000),
  CONSTRAINT client_error_reports_route_check
    CHECK (route IS NULL OR length(route) <= 500),
  CONSTRAINT client_error_reports_context_check
    CHECK (jsonb_typeof(context) = 'object')
);

CREATE INDEX client_error_reports_created_at_idx
  ON public.client_error_reports (created_at DESC);
CREATE INDEX client_error_reports_correlation_idx
  ON public.client_error_reports (correlation_id, created_at DESC);

ALTER TABLE public.client_error_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client errors: reviewer read"
ON public.client_error_reports FOR SELECT TO authenticated
USING (public.get_my_role() IN ('administrator', 'manager'));

CREATE OR REPLACE FUNCTION public.record_client_error(
  p_correlation_id text,
  p_event text,
  p_message text,
  p_route text DEFAULT NULL,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR public.get_my_role() IS NULL THEN
    RAISE EXCEPTION 'Authenticated active user required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.client_error_reports (
    user_id, correlation_id, event, message, route, context
  ) VALUES (
    v_user_id,
    left(coalesce(p_correlation_id, ''), 36),
    left(coalesce(p_event, ''), 120),
    left(coalesce(p_message, ''), 2000),
    nullif(left(coalesce(p_route, ''), 500), ''),
    CASE WHEN jsonb_typeof(coalesce(p_context, '{}'::jsonb)) = 'object'
      THEN coalesce(p_context, '{}'::jsonb)
      ELSE '{}'::jsonb
    END
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON public.client_error_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.client_error_reports TO authenticated;
GRANT ALL ON public.client_error_reports TO service_role;

REVOKE ALL ON FUNCTION public.record_client_error(text,text,text,text,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_client_error(text,text,text,text,jsonb)
  TO authenticated, service_role;

COMMENT ON TABLE public.client_error_reports IS
  'Sanitized client-side failures for small-team operational diagnosis; no form payloads or secrets.';
COMMENT ON FUNCTION public.record_client_error(text,text,text,text,jsonb) IS
  'Records a length-limited diagnostic for the active authenticated user.';
