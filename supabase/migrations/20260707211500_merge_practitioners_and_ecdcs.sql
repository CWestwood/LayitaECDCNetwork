DROP FUNCTION IF EXISTS public.merge_practitioners(uuid, uuid);
DROP FUNCTION IF EXISTS public.merge_practitioners(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.merge_ecdcs(uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.merge_practitioners(
  keep_id uuid,
  discard_id uuid,
  field_choices jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_keep public.practitioners%ROWTYPE;
  v_discard public.practitioners%ROWTYPE;
  v_visit_count int := 0;
  v_plan_count int := 0;
  v_training_moved boolean := false;
  v_pick text;
BEGIN
  v_role := public.get_my_role();
  IF v_role <> ALL (ARRAY['administrator', 'manager']) THEN
    RETURN jsonb_build_object('error', 'Only administrators and managers can merge practitioners', 'code', 'UNAUTHORIZED');
  END IF;

  IF keep_id = discard_id THEN
    RETURN jsonb_build_object('error', 'Cannot merge a practitioner into itself', 'code', 'INVALID_MERGE');
  END IF;

  SELECT * INTO v_keep FROM public.practitioners WHERE id = keep_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Practitioner to keep not found', 'code', 'KEEP_NOT_FOUND');
  END IF;

  SELECT * INTO v_discard FROM public.practitioners WHERE id = discard_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Practitioner to merge not found', 'code', 'DISCARD_NOT_FOUND');
  END IF;

  UPDATE public.outreach_visits
  SET practitioner_id = keep_id
  WHERE practitioner_id = discard_id;
  GET DIAGNOSTICS v_visit_count = ROW_COUNT;

  UPDATE public.planned_visits
  SET practitioner_id = keep_id,
      practitioner_name = COALESCE(v_keep.name, practitioner_name),
      updated_at = now()
  WHERE practitioner_id = discard_id;
  GET DIAGNOSTICS v_plan_count = ROW_COUNT;

  v_pick := COALESCE(field_choices->>'name', 'keep');
  IF v_pick = 'discard' THEN v_keep.name := v_discard.name; END IF;

  v_pick := COALESCE(field_choices->>'contact_number1', 'coalesce');
  IF v_pick = 'discard' THEN
    v_keep.contact_number1 := v_discard.contact_number1;
  ELSIF v_pick = 'coalesce' THEN
    v_keep.contact_number1 := COALESCE(NULLIF(v_keep.contact_number1, ''), NULLIF(v_discard.contact_number1, ''));
  END IF;

  v_pick := COALESCE(field_choices->>'contact_number2', 'coalesce');
  IF v_pick = 'discard' THEN
    v_keep.contact_number2 := v_discard.contact_number2;
  ELSIF v_pick = 'coalesce' THEN
    v_keep.contact_number2 := COALESCE(NULLIF(v_keep.contact_number2, ''), NULLIF(v_discard.contact_number2, ''));
  END IF;

  v_pick := COALESCE(field_choices->>'ecdc_id', 'coalesce');
  IF v_pick = 'discard' THEN
    v_keep.ecdc_id := v_discard.ecdc_id;
  ELSIF v_pick = 'coalesce' THEN
    v_keep.ecdc_id := COALESCE(v_keep.ecdc_id, v_discard.ecdc_id);
  END IF;

  v_pick := COALESCE(field_choices->>'group_id', 'coalesce');
  IF v_pick = 'discard' THEN
    v_keep.group_id := v_discard.group_id;
  ELSIF v_pick = 'coalesce' THEN
    v_keep.group_id := COALESCE(v_keep.group_id, v_discard.group_id);
  END IF;

  v_pick := COALESCE(field_choices->>'group', 'coalesce');
  IF v_pick = 'discard' THEN
    v_keep.group := v_discard.group;
  ELSIF v_pick = 'coalesce' THEN
    v_keep.group := COALESCE(NULLIF(v_keep.group, ''), NULLIF(v_discard.group, ''));
  END IF;

  v_pick := COALESCE(field_choices->>'has_whatsapp', 'or');
  IF v_pick = 'discard' THEN
    v_keep.has_whatsapp := v_discard.has_whatsapp;
  ELSIF v_pick = 'or' THEN
    v_keep.has_whatsapp := COALESCE(v_keep.has_whatsapp, false) OR COALESCE(v_discard.has_whatsapp, false);
  END IF;

  v_pick := COALESCE(field_choices->>'dsd_registered', 'coalesce');
  IF v_pick = 'discard' THEN
    v_keep.dsd_registered := v_discard.dsd_registered;
  ELSIF v_pick = 'coalesce' THEN
    v_keep.dsd_registered := COALESCE(v_keep.dsd_registered, v_discard.dsd_registered);
  END IF;

  v_pick := COALESCE(field_choices->>'dsd_funded', 'coalesce');
  IF v_pick = 'discard' THEN
    v_keep.dsd_funded := v_discard.dsd_funded;
  ELSIF v_pick = 'coalesce' THEN
    v_keep.dsd_funded := COALESCE(v_keep.dsd_funded, v_discard.dsd_funded);
  END IF;

  v_pick := COALESCE(field_choices->>'status', 'keep');
  IF v_pick = 'discard' THEN v_keep.status := v_discard.status; END IF;

  UPDATE public.practitioners
  SET name = v_keep.name,
      contact_number1 = v_keep.contact_number1,
      contact_number2 = v_keep.contact_number2,
      ecdc_id = v_keep.ecdc_id,
      group_id = v_keep.group_id,
      dsd_funded = v_keep.dsd_funded,
      dsd_registered = v_keep.dsd_registered,
      has_whatsapp = v_keep.has_whatsapp,
      "group" = v_keep.group,
      status = v_keep.status,
      updated_at = now()
  WHERE id = keep_id;

  IF EXISTS (SELECT 1 FROM public.training WHERE id = keep_id)
     AND EXISTS (SELECT 1 FROM public.training WHERE id = discard_id) THEN
    UPDATE public.training keep_training
    SET smart_start_ever = COALESCE(keep_training.smart_start_ever, false) OR COALESCE(discard_training.smart_start_ever, false),
        smart_start_date = COALESCE(keep_training.smart_start_date, discard_training.smart_start_date),
        first_aid_ever = COALESCE(keep_training.first_aid_ever, false) OR COALESCE(discard_training.first_aid_ever, false),
        first_aid_date = COALESCE(keep_training.first_aid_date, discard_training.first_aid_date),
        level4_ever = COALESCE(keep_training.level4_ever, false) OR COALESCE(discard_training.level4_ever, false),
        level4_date = COALESCE(keep_training.level4_date, discard_training.level4_date),
        level5_ever = COALESCE(keep_training.level5_ever, false) OR COALESCE(discard_training.level5_ever, false),
        level5_date = COALESCE(keep_training.level5_date, discard_training.level5_date),
        wordworks03_ever = COALESCE(keep_training.wordworks03_ever, false) OR COALESCE(discard_training.wordworks03_ever, false),
        wordworks03_date = COALESCE(keep_training.wordworks03_date, discard_training.wordworks03_date),
        wordworks35_ever = COALESCE(keep_training.wordworks35_ever, false) OR COALESCE(discard_training.wordworks35_ever, false),
        wordworks35_date = COALESCE(keep_training.wordworks35_date, discard_training.wordworks35_date),
        littlestars_ever = COALESCE(keep_training.littlestars_ever, false) OR COALESCE(discard_training.littlestars_ever, false),
        littlestars_date = COALESCE(keep_training.littlestars_date, discard_training.littlestars_date),
        other = NULLIF(trim(BOTH '; ' FROM concat_ws('; ', NULLIF(keep_training.other, ''), NULLIF(discard_training.other, ''))), ''),
        other_date = COALESCE(keep_training.other_date, discard_training.other_date)
    FROM public.training discard_training
    WHERE keep_training.id = keep_id
      AND discard_training.id = discard_id;

    DELETE FROM public.training WHERE id = discard_id;
    v_training_moved := true;
  ELSIF EXISTS (SELECT 1 FROM public.training WHERE id = discard_id) THEN
    UPDATE public.training SET id = keep_id WHERE id = discard_id;
    v_training_moved := true;
  END IF;

  UPDATE public.practitioners
  SET deleted_at = now(),
      status = COALESCE(status, 'inactive'),
      updated_at = now()
  WHERE id = discard_id;

  INSERT INTO public.audit_logs (table_name, record_id, changed_fields, changed_by_id)
  VALUES (
    'practitioners',
    keep_id,
    jsonb_build_object(
      'action', jsonb_build_object('old', null, 'new', 'MERGE_PRACTITIONERS'),
      'kept_name', jsonb_build_object('old', null, 'new', v_keep.name),
      'discarded_id', jsonb_build_object('old', null, 'new', discard_id),
      'discarded_name', jsonb_build_object('old', null, 'new', v_discard.name),
      'visits_moved', jsonb_build_object('old', 0, 'new', v_visit_count),
      'planned_visits_moved', jsonb_build_object('old', 0, 'new', v_plan_count)
    ),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Practitioners merged',
    'kept_id', keep_id,
    'kept_name', v_keep.name,
    'discarded_id', discard_id,
    'discarded_name', v_discard.name,
    'visits_moved', v_visit_count,
    'planned_visits_moved', v_plan_count,
    'training_moved', v_training_moved
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_ecdcs(
  keep_id uuid,
  discard_id uuid,
  field_choices jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_keep public.ecdc_list%ROWTYPE;
  v_discard public.ecdc_list%ROWTYPE;
  v_practitioner_count int := 0;
  v_pick text;
BEGIN
  v_role := public.get_my_role();
  IF v_role <> ALL (ARRAY['administrator', 'manager']) THEN
    RETURN jsonb_build_object('error', 'Only administrators and managers can merge ECDCs', 'code', 'UNAUTHORIZED');
  END IF;

  IF keep_id = discard_id THEN
    RETURN jsonb_build_object('error', 'Cannot merge an ECDC into itself', 'code', 'INVALID_MERGE');
  END IF;

  SELECT * INTO v_keep FROM public.ecdc_list WHERE id = keep_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ECDC to keep not found', 'code', 'KEEP_NOT_FOUND');
  END IF;

  SELECT * INTO v_discard FROM public.ecdc_list WHERE id = discard_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ECDC to merge not found', 'code', 'DISCARD_NOT_FOUND');
  END IF;

  UPDATE public.practitioners
  SET ecdc_id = keep_id,
      updated_at = now()
  WHERE ecdc_id = discard_id
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_practitioner_count = ROW_COUNT;

  v_pick := COALESCE(field_choices->>'name', 'keep');
  IF v_pick = 'discard' THEN v_keep.name := v_discard.name; END IF;

  v_pick := COALESCE(field_choices->>'area', 'coalesce');
  IF v_pick = 'discard' THEN
    v_keep.area := v_discard.area;
  ELSIF v_pick = 'coalesce' THEN
    v_keep.area := COALESCE(NULLIF(v_keep.area, ''), NULLIF(v_discard.area, ''));
  END IF;

  v_pick := COALESCE(field_choices->>'longitude', 'coalesce');
  IF v_pick = 'discard' THEN
    v_keep.longitude := v_discard.longitude;
  ELSIF v_pick = 'coalesce' THEN
    v_keep.longitude := COALESCE(v_keep.longitude, v_discard.longitude);
  END IF;

  v_pick := COALESCE(field_choices->>'latitude', 'coalesce');
  IF v_pick = 'discard' THEN
    v_keep.latitude := v_discard.latitude;
  ELSIF v_pick = 'coalesce' THEN
    v_keep.latitude := COALESCE(v_keep.latitude, v_discard.latitude);
  END IF;

  v_pick := COALESCE(field_choices->>'area_id', 'coalesce');
  IF v_pick = 'discard' THEN
    v_keep.area_id := v_discard.area_id;
  ELSIF v_pick = 'coalesce' THEN
    v_keep.area_id := COALESCE(v_keep.area_id, v_discard.area_id);
  END IF;

  v_pick := COALESCE(field_choices->>'chief', 'coalesce');
  IF v_pick = 'discard' THEN
    v_keep.chief := v_discard.chief;
  ELSIF v_pick = 'coalesce' THEN
    v_keep.chief := COALESCE(NULLIF(v_keep.chief, ''), NULLIF(v_discard.chief, ''));
  END IF;

  v_pick := COALESCE(field_choices->>'headman', 'coalesce');
  IF v_pick = 'discard' THEN
    v_keep.headman := v_discard.headman;
  ELSIF v_pick = 'coalesce' THEN
    v_keep.headman := COALESCE(NULLIF(v_keep.headman, ''), NULLIF(v_discard.headman, ''));
  END IF;

  v_pick := COALESCE(field_choices->>'number_children', 'coalesce');
  IF v_pick = 'discard' THEN
    v_keep.number_children := v_discard.number_children;
  ELSIF v_pick = 'coalesce' THEN
    v_keep.number_children := COALESCE(NULLIF(v_keep.number_children, ''), NULLIF(v_discard.number_children, ''));
  END IF;

  UPDATE public.ecdc_list
  SET name = v_keep.name,
      area = v_keep.area,
      longitude = v_keep.longitude,
      latitude = v_keep.latitude,
      area_id = v_keep.area_id,
      chief = v_keep.chief,
      headman = v_keep.headman,
      number_children = v_keep.number_children
  WHERE id = keep_id;

  UPDATE public.ecdc_list
  SET deleted_at = now()
  WHERE id = discard_id;

  INSERT INTO public.audit_logs (table_name, record_id, changed_fields, changed_by_id)
  VALUES (
    'ecdc_list',
    keep_id,
    jsonb_build_object(
      'action', jsonb_build_object('old', null, 'new', 'MERGE_ECDCS'),
      'kept_name', jsonb_build_object('old', null, 'new', v_keep.name),
      'discarded_id', jsonb_build_object('old', null, 'new', discard_id),
      'discarded_name', jsonb_build_object('old', null, 'new', v_discard.name),
      'practitioners_moved', jsonb_build_object('old', 0, 'new', v_practitioner_count)
    ),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'ECDCs merged',
    'kept_id', keep_id,
    'kept_name', v_keep.name,
    'discarded_id', discard_id,
    'discarded_name', v_discard.name,
    'practitioners_moved', v_practitioner_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_practitioners(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.merge_ecdcs(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_practitioners(uuid, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_ecdcs(uuid, uuid, jsonb) TO authenticated, service_role;
