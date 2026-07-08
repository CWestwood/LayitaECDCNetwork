CREATE OR REPLACE FUNCTION public.resolve_practitioner_external_id(raw_value text)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name
  FROM public.practitioners p
  WHERE lower(p.id::text) = lower(raw_value)
     OR replace(lower(p.id::text), '-', '') = lower(raw_value)
     OR md5(lower(p.id::text)) = lower(raw_value)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.resolve_ecdc_external_id(raw_value text)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.name
  FROM public.ecdc_list e
  WHERE lower(e.id::text) = lower(raw_value)
     OR replace(lower(e.id::text), '-', '') = lower(raw_value)
     OR md5(lower(e.id::text)) = lower(raw_value)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_practitioner_external_id(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_ecdc_external_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_practitioner_external_id(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_ecdc_external_id(text) TO authenticated, service_role;
