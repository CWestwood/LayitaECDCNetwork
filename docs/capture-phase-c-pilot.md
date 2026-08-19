# Capture Phase C — Website form pilot

Status: software foundation implemented on 2026-08-18. The live pilot and its evidence remain operational work; Phase C's exit gate must not be marked complete until real users and devices have passed the checks below.

## What is implemented

The authenticated `/capture` workflow submits the versioned `capture-v1` contract through `submit_outreach_capture(...)`. It is available only to active administrators, managers, and data capturers; the database derives the staff record from the signed-in profile and ignores browser-supplied staff identity.

The pilot form includes:

- all canonical outreach types and outcomes, including missed and alternative activities;
- conditional validation for outcome, transport, attendance, coordinates, and the ECDC/practitioner identity required by the selected activity;
- searchable canonical ECDC and practitioner records, multiple-practitioner selection, and client-side warnings for similar names;
- an explicit “not found” route that creates a governed correction request instead of creating an unreviewed canonical entity;
- device-local, per-user draft recovery with form version, immutable reference, and last-saved time;
- explicit Draft, Submitting, Submitted, Failed, and Needs review states;
- idempotent retry using the same capture reference and completion timestamp, plus an explicit “edit as a new reference” option after failure;
- optional browser geolocation and visible handling of location failure;
- a manager-facing queue under Quality & Audit for website identity review requests.

Binary files are intentionally not uploaded in Phase C. “Photos taken” records the structured fact only; private upload, interruption recovery, and attachment retry belong to Phase D.

## Why the implementation is deliberately small

The form uses the existing Supabase authentication, canonical RPC, correction-request governance, React Query cache, and application role model. It does not add another API service, workflow engine, offline database, form-builder dependency, or website-specific reconciliation table. One recoverable draft per signed-in user and device is appropriate for the pilot; a multi-record offline outbox should be added only if field evidence justifies Phase F.

## Pre-pilot checklist

The pilot owner should complete this list before inviting users:

1. Apply all migrations through `20260817130000_phase_b_canonical_capture.sql` and run the database contracts.
2. Confirm each pilot user has an active profile, an allowed role, and a link to an active `layita_staff` row.
3. Confirm managers can open Quality & Audit and see the “Website capture identity reviews” section.
4. Choose two to five pilot users and keep Kobo available as the named fallback channel.
5. Test at least one current Android phone, one current iPhone if the team uses iOS, and a desktop browser used by managers.
6. Tell users that drafts are stored only in that browser on that device. Private/incognito mode, clearing browser data, or changing devices will not transfer a draft.
7. Name one operational owner who can answer form questions and one manager who will clear identity-review requests daily.

## Acceptance scenarios

Run each scenario using a non-production test ECDC/practitioner where possible. Record pass/fail, device, browser, user, and notes.

| Scenario | Expected result |
| --- | --- |
| Practitioner support with one practitioner | One canonical visit, correct signed-in staff, selected practitioner linked |
| Outreach with multiple practitioners | One visit and one participant link per selected practitioner; counts recorded once for the visit |
| ECDC mapping | Existing ECDC is selected; the form never silently creates a similarly named ECDC |
| Different to planned | Alternative activity is required and appears on the visit |
| Did not happen | People, transport, and result fields are not required |
| Parents attending above enrolled | Submission is blocked with an understandable field error |
| Unknown practitioner or ECDC | No canonical duplicate is created; an open correction request appears in Quality & Audit |
| Refresh or accidental navigation | Draft, capture reference, form version, and entered fields recover on the same browser/device |
| Double tap on Submit | Only one submission call is accepted and one visit is reported |
| Network failure after Submit | Failed state retains the reference; retrying the same reference does not duplicate the visit |
| Expired session | User is told to sign in again and the local draft remains recoverable |
| Narrow phone viewport (about 360 px) | No horizontal form scrolling; fields and action buttons remain readable and tappable |
| Larger phone viewport (about 430 px) | Conditional fields, selectors, status, and sticky submit action remain usable |

## Pilot measurement sheet

Use a small shared sheet or paper log during the pilot; a new monitoring system is not warranted yet. Record one row per attempted capture with no child or practitioner personal details:

| Field | How to record it |
| --- | --- |
| Date and pilot user | Day plus user/team identifier |
| Channel | Website or Kobo |
| Capture reference | Website reference shown in the form, or Kobo submission ID |
| Activity and outcome | Canonical activity/outcome labels |
| Completion time | Approximate minutes from starting to Submitted/Needs review |
| Result | Submitted, Needs review, Failed, or abandoned |
| Missing fields | Count only; do not copy sensitive values into the pilot sheet |
| Duplicate | Yes only after manager confirmation |
| Support incident | Brief category: sign-in, identity, validation, network, device, or other |
| Notes | Short operational observation |

Review these measures weekly:

- website and Kobo counts versus the canonical outreach report;
- required-field completeness and unexplained null values;
- confirmed duplicate rate;
- open identity-review count and median time to resolution;
- median completion time by channel;
- failed/abandoned attempt rate and support incidents by category.

## Stop and fallback rules

Pause website capture and use Kobo if submissions cannot be confirmed, the canonical report is missing accepted visits, identity reviews are not being handled, or repeated session/network failures affect more than one user. Preserve the displayed capture references and the pilot log. Do not repeatedly submit changed data under the same reference; use “Edit as a new reference” when details must change after a failed attempt.

## Phase C exit decision

Phase C passes only when:

- the acceptance scenarios pass on representative phones;
- every accepted website submission appears exactly once in canonical reporting;
- every Needs review result appears in the manager queue and has an owner;
- website, Kobo, and canonical totals reconcile for the pilot period;
- there is no unresolved high-severity accessibility, session, retry, or data-loss defect.

Keep the website as a pilot channel until those conditions are evidenced. Proceed to Phase D only after the Phase C exit decision is recorded; attachment work must not be used to mask a structured-capture reliability problem.
