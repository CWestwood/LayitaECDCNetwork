create or replace view kobo_submission_monitor as
select
  r.instance_id,
  r.submitted_at,
  p.processed_at,
  p.status,
  p.error_message,
  p.warnings,

  r.payload->>'data_capturer' as data_capturer,
  r.payload->>'ecdc_name_text' as ecdc_name,

  coalesce(
    case
      when r.payload->>'ecdc_practitioner' = 'none'
      then nullif(r.payload->>'ecdc_practitioner_new','')
    end,
    prac.name,
    nullif(r.payload->>'ecdc_practitioner',''),
    'Unknown'
  ) as practitioner_name,

  r.payload->>'outreach_date' as outreach_date,
  r.payload->>'outreach_type' as outreach_type,

  case
    when p.instance_id is null then 'pending'
    else p.status
  end as processing_state,

  extract(epoch from (p.processed_at - r.submitted_at))::int as processing_seconds,

  r.payload

from kobo_raw_submissions r
left join kobo_processed p
  on r.instance_id = p.instance_id
left join practitioners prac
  on r.payload->>'ecdc_practitioner' = prac.id::text
  or r.payload->>'ecdc_practitioner' = replace(prac.id::text, '-', '')
  or r.payload->>'ecdc_practitioner' = md5(prac.id::text)

order by r.submitted_at desc;

CREATE OR REPLACE FUNCTION set_attendance_updated()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update timestamp if number_children actually changed
  IF NEW.number_children IS DISTINCT FROM OLD.number_children THEN
    NEW.attendance_updated = now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_attendance_updated
BEFORE UPDATE ON ecdc_list
FOR EACH ROW
EXECUTE FUNCTION set_attendance_updated();