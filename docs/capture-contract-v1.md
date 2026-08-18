# Canonical capture contract v1

Status: implemented in Capture Phase B. This is an internal application contract, not a public API. The website form planned for Phase C and the Kobo adapter both submit through `submit_outreach_capture(...)`.

## RPC envelope

`submit_outreach_capture` accepts:

- `p_capture_id`: immutable, client-generated attempt identifier. Repeating the same ID and payload returns the original result; reusing it with changed content is rejected.
- `p_source`: `website` or `kobo`.
- `p_form_version`: currently `capture-v1`.
- `p_payload`: the canonical JSON object below.
- `p_client_created_at`: optional client completion time.
- `p_correlation_id`: optional diagnostic identifier.
- `p_actor_id`: service provenance only. Website identity is always taken from the authenticated session.

Kobo's stable submission ID is carried as `external_id`. This is intentionally separate from `capture_id`: an exact retry remains idempotent, while a later reviewed reprocess is a new capture attempt that updates the same Kobo visit.

## Canonical payload

```json
{
  "external_id": "source-stable-id",
  "adapter": { "name": "kobo", "version": "processor-version" },
  "staff_id": "service-only-staff-uuid",
  "visit": {
    "date": "2026-08-17",
    "outreach_type": "practitioner_support",
    "outreach_happened": "happened",
    "did_instead": null,
    "comments": null,
    "transport_type": "private",
    "transport_cost": 0,
    "transport_km": 0,
    "practitioner_id": "uuid-or-null",
    "parents_enrolled": 0,
    "parents_trained": 0,
    "children_books": 0,
    "books_per_child": 0,
    "books_to_practitioner": 0,
    "photos_taken": false,
    "people_reached": 0,
    "capture_started_at": "ISO-8601-or-null",
    "capture_ended_at": "ISO-8601-or-null",
    "public_transport_accessible": true,
    "bookdash_given": false,
    "captured_latitude": -31.9,
    "captured_longitude": 28.6,
    "captured_altitude_m": 800,
    "captured_accuracy_m": 10
  },
  "ecdc": {
    "id": "existing-uuid-or-null",
    "values": { "name": "Only required for an explicit new ECDC" }
  },
  "practitioner": {
    "id": "existing-uuid-or-null",
    "values": { "name": "Only required for an explicit new practitioner" },
    "training": {}
  },
  "practitioner_ids": ["primary-or-additional-uuid"],
  "attachments": [
    { "source_field": "site_photo", "source_filename": "photo.jpg", "mime_type": "image/jpeg" }
  ]
}
```

Allowed outreach type codes are `caregiver_training`, `literacy_promotion`, `practitioner_support`, `ecdc_mapping`, `interested_practitioner`, `ecdc_update`, and `other`. Visit outcomes are `happened`, `different_to_planned`, and `did_not_happen`.

## Server invariants

- Website submission is allowed for active administrators, managers, and data capturers linked to active staff. Supplied website `staff_id` values are ignored.
- Kobo submission requires `service_role`, a known raw Kobo record, and an active staff ID when one is supplied.
- Operational visit branches require a valid outcome. `different_to_planned` requires `did_instead`.
- Counts, distance, cost, and accuracy are non-negative; attendance cannot exceed enrolment; latitude and longitude are bounded.
- Referenced ECDCs and practitioners must exist and not be deleted. Unknown adapter identities stay in Kobo reconciliation rather than becoming canonical entities.
- The submission ledger, entity changes, visit, participant links, source lineage, training, and attachment metadata commit in one PostgreSQL transaction. Any late constraint or reference failure rolls all of them back.

## Result

A successful result contains `success`, `duplicate`, `visit_id`, `ecdc_id`, and `practitioner_id`. Expected validation and authorization rejections return `success: false` plus a stable `code`. Database integrity failures surface as RPC errors and leave no partial canonical state.

Binary attachment upload is deliberately outside this contract and remains Capture Phase D work.
