# ECDC Outreach Form — Kobo → Database Ingestion Guide

This is a developer/agent-readable reference generated from the KoboToolbox
XLSForm `aYUG78pqvXan6bMfk9TquB_1_.xlsx`. Use it together with
`kobo-form-schema.json` (machine-readable field list) and `schema.sql`
(proposed Postgres/Supabase table) to build an edge function that ingests
submissions into a database.

## 1. What this form is

Field staff use it in KoboCollect to log outreach visits to Early Childhood
Development Centres (ECDCs) and their practitioners: what kind of outreach
happened, transport used, who was visited, and — depending on the outreach
type — either **mapping details** about the ECDC or **caregiver/practitioner
support** data (books given out, training attendance, etc.).

Three sheets exist in the source file:
- `survey` — the questions, in order, with skip logic (`relevant`),
  validation (`constraint`), and calculated fields (`calculation`).
- `choices` — the option lists referenced by `select_one` / `select_multiple`
  questions.
- `settings` — empty in this form (no custom form id/title set there).

## 2. How this becomes JSON at submission time

Kobo submissions do **not** arrive shaped like the XLSForm rows. Keep these
rules in mind when writing the parser:

- **Groups become path-prefixed keys.** Every question inside
  `begin_group mapping ... end_group` arrives as `"mapping/area"`,
  `"mapping/location"`, etc. Same for `support/*`. Top-level questions have
  no prefix.
- **Kobo adds its own metadata fields** to every submission, not present in
  the XLSForm: `_id`, `_uuid`, `_submission_time`, `_submitted_by`,
  `_validation_status`, `_status`, `_tags`, `_notes`, `_geolocation`,
  `formhub/uuid`, `meta/instanceID`. Your edge function should capture at
  least `_id` and `_uuid` (use `_uuid` as your idempotency/upsert key — Kobo
  can redeliver webhooks).
- **`select_multiple` fields are a single space-separated string** of choice
  `name`s (not labels), e.g. `"mapping/training_prev": "firstaid level4"`.
  Split on whitespace to get an array.
- **`select_one` fields store the choice `name`, not the `label`.** Join
  against the `choices` list in `kobo-form-schema.json` if you need the
  human-readable label.
- **`geopoint` fields are a single string**: `"lat lon altitude accuracy"`,
  e.g. `"mapping/location": "-31.98 28.77 0 4.9"`. Split on whitespace; some
  or all trailing values may be missing.
- **`image` fields store just the original filename** (e.g.
  `"mapping/photo_site": "1650000000123.jpg"`). The actual file is fetched
  separately via the Kobo API's attachment endpoint
  (`/api/v2/assets/{asset_uid}/data/{submission_id}/attachments/...`), which
  requires an authenticated request with your Kobo API token. Plan for a
  second step in the edge function (or a follow-up job) that downloads each
  attachment and re-uploads it to your own storage (see `schema.sql`'s
  `outreach_attachments` table).
- **Calculated fields (`type: calculate`) are already resolved values**,
  not formulas — Kobo Collect evaluates them client-side against the linked
  `practitioner_list.csv` / `ecdc_list.csv` external data files (referenced
  in the XLSForm via `instance("practitioner_list")` / `instance("ecdc_list")`
  XPath expressions) before submission. Those two CSVs are **not included**
  in this xlsform export — they're managed as separate "media" files
  attached to the Kobo form. You don't need them to ingest submissions;
  the resolved values (`ecdc_name`, `ecdc_area`, `practitioner_contact1`,
  etc.) are already flat strings in the submission JSON. You'd only need
  the CSVs if you want to independently validate/re-derive those values.
- **`note` type fields (`prac_note`, `ecdc_note`, `practitioners_trained`)
  are display-only** — they never appear as data keys in a submission.
  Skip them entirely in your field mapping.
- **`start`/`end` are ISO 8601 datetimes**, auto-captured by Kobo Collect.

## 3. Conditional (skip-logic) fields — expect nulls/missing keys

Most fields after `outreach_type` are conditionally shown (see the
`relevant` column in `kobo-form-schema.json`), branching on:

- `outreach_type` (`mapping`, `update`, `caregiver`, `interested`, and
  implicitly others like `support`/`literacy_promotion` referenced in later
  conditions but not present in the `outreach_type` choice list — worth
  flagging to whoever maintains the form, it looks like a possible gap/typo
  between the `outreach_type` and `vk2fa82` choice lists)
- `happened` (`yes` / `no` / `else`)
- `prac_visit`, `details_needed` (multi-select), `training_yn`, `bookdash`

**Practical implication:** your edge function must treat every field except
`start`, `end`, `outreach_date`, `data_capturer`, `outreach_type`, and
`happened` as optional/nullable — a given submission will only contain the
subset of keys that were actually relevant for that branch. Don't assume
required-in-schema means present-in-every-row; `required` in the XLSForm
only means "required if shown."

## 4. Field reference

Full machine-readable list (name, group, type, label, required, relevant
condition, constraint, and resolved choice options) is in
`kobo-form-schema.json`. Summary by section:

| Section | Fields |
|---|---|
| Core | `outreach_date`, `data_capturer`, `outreach_type`, `happened`, `What_did_you_do_instead`, `transport_type`, `transport_cost`, `km_logged`, `Is_this_site_accessi_by_public_transport` |
| Practitioner lookup | `prac_visit`, `ecdc_practitioner`, `practitioner_new`, `group` |
| Calculated (from external CSVs) | `ecdc_name`, `practitioner_contact1`, `practitioner_contact2`, `ecdc_name_text`, `ecdc_area`, `ecdc_dsd`, `ecdc_practitioner_001`, `franchise_group` |
| Reach | `Number_of_people_reached` |
| Group `mapping` | `details_needed`, `area`, `ecdc_name_link`, `ecdc_name_link_new`, `practitioner_whatsapp`, `practitioner_number_1`, `practitioner_number_2`, `location`, `dsd_registered`, `dsd_funded`, `chief`, `headman`, `number_children`, `training_yn`, `training_prev`, `training_prev_other`, `photo_site` |
| Group `support` | `parents_enrolled`, `parents_present`, `bookdash`, `bookdash_children`, `bookdash_perchild`, `bookdash_practitioner` |
| Free text | `comments` |

Note two naming quirks to preserve exactly (don't "clean up" the names —
they must match the Kobo JSON keys verbatim): `Number_of_people_reached`
and `Is_this_site_accessi_by_public_transport` use unusual
capitalization/spelling, and the question `type: select_one group` has the
raw field name `group` (a reserved word in SQL — mapped to `ecdc_group` in
`schema.sql`, keep that rename in your mapping code).

Two `constraint` expressions in the source form
(`practitioner_number_1`/`practitioner_number_2`) use curly/smart quotes
(`’`) instead of straight quotes inside `regex(...)` — likely a copy-paste
artifact in the XLSForm itself. It doesn't affect the submission JSON shape,
just flagging in case validation on the Kobo side has been silently broken.

## 5. Suggested edge function flow (Supabase, Deno/TypeScript)

1. **Trigger:** register the edge function URL as a Kobo REST Services
   webhook (or poll `/api/v2/assets/{asset_uid}/data.json` on a schedule) so
   it receives each submission as JSON POST body.
2. **Verify/parse:** read the JSON body; pull out `_uuid`, `_id`,
   `_submission_time`, `_submitted_by`, `_validation_status`.
3. **Map fields:** walk the flat submission object using the `path` values
   from `kobo-form-schema.json` (e.g. `submission["mapping/area"]`) into the
   column names in `schema.sql`.
4. **Transform:**
   - split `select_multiple` strings on `/\s+/` → array
   - split `geopoint` strings on whitespace → lat/lon/alt/accuracy floats
   - parse `integer` fields with `Number()`, allow `null`
5. **Upsert:** `insert into outreach_submissions (...) values (...)
   on conflict (kobo_uuid) do update set ...` — idempotent against Kobo
   webhook retries.
6. **Attachments:** for any image field present (e.g. `mapping/photo_site`),
   queue/download the file from Kobo's attachment API using your Kobo API
   token, upload to Supabase Storage, and insert a row into
   `outreach_attachments`.
7. **Always store `raw_payload` (the full original JSON)** in the main row
   as a fallback/audit trail — this form is actively being edited (skip
   logic references choices like `support`/`literacy_promotion` that aren't
   yet in the `outreach_type` list), so future field additions won't cause
   data loss even before the column mapping is updated.

## 6. Files in this deliverable

- `kobo-form-schema.json` — full structured field list extracted from the
  XLSForm (name, path, group, type, label, hint, required, relevant,
  constraint, calculation, and resolved choice options).
- `schema.sql` — proposed Postgres/Supabase DDL (`outreach_submissions` +
  `outreach_attachments`) matching the field list above.
- `KOBO_INGESTION_GUIDE.md` — this file.
