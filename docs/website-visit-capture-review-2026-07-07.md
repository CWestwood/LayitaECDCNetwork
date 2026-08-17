# Website Visit Capture Review

Date: 2026-07-07

## Purpose

This note reviews the implementation challenges for adding direct website-based visit capture while internet access is available. It is based on the current Kobo XLSForm in `Kobo form design.xlsx`, the Supabase schema, and the Kobo Edge Function processing flow.

## Recommended Approach

Build direct capture as a first-class frontend workflow that writes to Supabase with the same normalized shape as Kobo, but do not try to mirror Kobo's form mechanics exactly. Kobo remains the offline/mobile collection tool. The website should be the clearer office-and-field-online version with better lookup, validation, and correction support.

The safest path is:

1. Add a dedicated "Capture Visit" workflow in the app.
2. Use existing Supabase tables as the write target: `outreach_visits`, `practitioners`, `ecdc_list`, and `training`.
3. For new/interested practitioners and ECDC updates, write through RPCs or mutation hooks that enforce role checks, validation, and audit logging.
4. Keep `source = 'manual'` for newly captured web visits and `source = 'manual_edit'` for later edits.
5. Preserve Kobo-specific provenance only for Kobo submissions. Do not fake `kobo_instance_id` for manual entries.

## Core Form Sections

The website form should use conditional steps instead of one long form:

- Visit basics: date, staff member, outreach type, whether the visit happened, what happened instead, comments.
- Practitioner/ECDC lookup: searchable practitioner selector, ECDC context preview, option to add a new/interested practitioner where allowed.
- Transport: transport type, cost, kilometres, public transport accessibility.
- Activity details: caregiver/support/literacy counts, people reached, BookDash book counts.
- ECDC update details: area, ECDC name, location, DSD status, chief/headman, attendance, practitioner contact, previous training.
- Review and submit: show the normalized records that will be created or updated before saving.

## Location Capture

Location capture is the main browser-specific challenge.

- Browser geolocation requires HTTPS or localhost and explicit user permission.
- Accuracy can vary widely, especially indoors or on poor mobile connections.
- Staff need a manual fallback: "Use my current location", "Enter coordinates", and ideally "adjust on map".
- Store latitude/longitude in the existing columns, but show accuracy and capture method if new columns are added later.
- Do not overwrite an existing ECDC location silently. If a location already exists, show the old and new values and require confirmation.

## Data Integrity Challenges

- Practitioner selection must use real Supabase UUIDs internally, while displaying names, ECDC, area, and group to staff.
- New practitioner creation should check for similar names before saving.
- ECDC update submissions should support partial updates and should not force unrelated fields to be rewritten.
- Numeric fields should enforce the Kobo constraints in the browser before submit, including non-negative transport values and sensible upper bounds for people/books.
- The form should prevent UUID/hash-like values from ever being saved as human names.
- Repeated submits should be idempotent from the UI perspective: disable submit while saving and show the saved visit afterwards.

## Audit And Correction

Direct capture needs a correction path from day one:

- Staff should be able to see their own recent submissions and request corrections.
- Admin/monitoring staff should be able to edit normalized records with an audit trail.
- Inserts, updates, correction requests, and soft deletes should all have clear human-readable audit entries.
- Manual edits should capture changed fields only, to avoid noisy audit logs.

## Access Control

The UI should not be the security boundary.

- Field/data-capture staff can create visits and view enough lookup information to select the right practitioner/ECDC.
- They should not be able to browse raw Kobo submissions, deleted records, staff management, or broad audit logs.
- Managers/admins can review, edit, resolve unmatched records, and monitor data quality.
- RLS/RPC policies should enforce the role matrix even if a hidden route is manually opened.

## Functional Gaps To Close Before Building

- Decide whether `update` is a visit, a record update, or both. The current frontend hides update visits in some places, but the data model still records them as outreach visits.
- Decide how to represent `interested` practitioners: current schema supports `practitioners.status = 'interested'`, but the UI should make this status obvious.
- Decide whether `literacy_promotion` is a primary outreach type or only a "did instead" value. The Kobo form currently puts it under "What did you do instead?"
- Add or confirm RPCs for safe manual creation/update, especially for ECDC/practitioner updates that must be audited.
- Confirm whether location accuracy, photo evidence, and public-transport accessibility need dedicated columns before the website form is built.

## Suggested First Implementation Slice

Start with a narrow online capture workflow for ordinary completed visits:

- Existing practitioner only.
- Outreach type: caregiver/support/literacy-style visit.
- Visit date, staff member, happened, transport, counts, comments.
- Browser validation and mutation hook.
- Role-limited insert into `outreach_visits`.
- Immediate success page linking to the visit detail.

After that, add new/interested practitioner capture, then ECDC update capture, then geolocation/map adjustment.
