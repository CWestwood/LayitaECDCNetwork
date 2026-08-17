-- Mirrors the production dashboard change:
--   DROP EXTENSION IF EXISTS postgis CASCADE;
--
-- The app stores map coordinates in ecdc_list.latitude/ecdc_list.longitude, so
-- the old PostGIS geography column is no longer part of the active model.

DROP INDEX IF EXISTS public.ecdc_list_location_idx;

ALTER TABLE IF EXISTS public.ecdc_list
  DROP COLUMN IF EXISTS location;

DROP FUNCTION IF EXISTS public.get_deleted_ecdcs();

CREATE OR REPLACE FUNCTION public.get_deleted_ecdcs()
RETURNS TABLE(
  id uuid,
  created_at timestamp with time zone,
  name text,
  area text,
  longitude double precision,
  latitude double precision,
  area_id uuid,
  chief text,
  headman text,
  number_children text,
  attendance_updated timestamp with time zone,
  deleted_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_my_role() != 'administrator' THEN
    RAISE EXCEPTION 'Only administrators can view deleted records';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.created_at,
    e.name,
    e.area,
    e.longitude,
    e.latitude,
    e.area_id,
    e.chief,
    e.headman,
    e.number_children,
    e.attendance_updated,
    e.deleted_at
  FROM public.ecdc_list e
  WHERE e.deleted_at IS NOT NULL
  ORDER BY e.deleted_at DESC;
END;
$$;

ALTER FUNCTION public.get_deleted_ecdcs() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_deleted_ecdcs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_deleted_ecdcs() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_deleted_ecdcs() TO authenticated, service_role;

DROP EXTENSION IF EXISTS postgis CASCADE;
