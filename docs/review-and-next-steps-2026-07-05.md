# Review And Next Steps

Date: 2026-07-05

This document captures the practical improvement themes from the current-state review, with emphasis on making the system trustworthy, usable, and governable for field staff, managers, and administrators.

## 1. Data Origin And Trust

The system should make provenance visible everywhere important.

### Current State

- Raw Kobo payloads are stored in `kobo_raw_submissions`.
- Processed status is stored in `kobo_processed`.
- Visits store `kobo_instance_id` and `source`.
- Admins have a Kobo monitor.

### Main Gap

Normal staff looking at a visit, practitioner, or ECDC cannot easily see whether a record came from Kobo, manual edit, reprocess, or correction.

### Recommended Improvements

- Add a visible source badge on visit detail pages: Kobo, Manual, Edited, Reprocessed.
- Add a submission history panel linking a visit back to the Kobo submission ID.
- In admin views, show processing warnings next to affected visits and practitioners.
- Store and display `processed_by`, `last_corrected_by`, and `correction_reason`.

This would make the data feel less mysterious to staff.

## 2. Matching Accuracy: Practitioner And ECDC Assignment

This is probably the most important functional gap.

### Current State

- Mapping visits can create or update ECDCs and practitioners.
- Lookup-only visits try UUID first, then name fallback, then similar-name warnings.
- Unmatched rows go into `kobo_unmatched`.
- There is a `useUnmatchedQueue` hook, but no complete admin workflow surfaced prominently.

### Main Gap

There is no strong data quality workbench for admins to resolve incorrect matches, duplicate practitioners, or unmatched submissions.

### Recommended Improvements

Add an admin Data Quality Queue page with tabs for:

- Unmatched practitioner
- Similar or possible duplicate practitioner
- Missing ECDC
- Partial Kobo submission
- Failed submission
- Records changed by manual edit

Each queue item should offer clear actions:

- Link to existing practitioner
- Create new practitioner
- Link to existing ECDC
- Create new ECDC
- Merge practitioners
- Reprocess submission
- Mark as reviewed

Additional backend support:

- Add a safe `resolve_unmatched_submission` RPC rather than resolving directly from the frontend.
- Add a proper practitioner merge workflow. There is already a `merge_practitioners` SQL function, but it is not exposed as a polished admin workflow.

This is the bridge between "data exists" and "data can be trusted."

## 3. Incorrect Data And Corrections

### Current State

- Some frontend forms allow edits.
- Audit logs capture updates.
- Soft delete exists.
- Hard delete exists.
- No restore function exists.
- Some edit forms update directly from components.

### Main Gap

Corrections are possible, but not governed enough. There is no correction reason, no review status, and no simple restore.

### Recommended Improvements

- Replace direct component writes with mutation hooks or RPCs for all correction flows.
- Require a correction reason for important edits:
  - Changing practitioner assignment
  - Changing ECDC assignment
  - Changing visit date or type
  - Changing attendance or children counts
  - Changing training status
- Add restore RPCs:
  - `restore_practitioner`
  - `restore_ecdc`
  - `restore_outreach_visit`
- Treat hard delete as exceptional. The normal admin workflow should be:
  - Soft delete
  - Review deleted record
  - Restore or archive
- Fix `hard_delete_outreach_visit`; the current schema dump still references `v_deleted_name` without declaring it inside that function.

This would give admin teams confidence that corrections are controlled rather than ad hoc.

## 4. Permissions And Visibility

### Current State

- There are roles: `administrator`, `manager`, `datacapturer`, and `library`.
- Admin routes are protected in the frontend.
- RLS exists in the database.
- Many operational tables are readable by all authenticated users.
- Some functions are granted to `anon`, although role checks may still block behavior.

### Main Gap

The intended permission model is not yet explicit enough. "Authenticated can read most things" may be okay for a tiny NGO, but it should be a conscious decision.

### Recommended Role Model

#### Field Staff / Data Capturer

- See own submitted visits.
- See assigned practitioner and ECDC information needed for fieldwork.
- Submit or correct own non-Kobo/manual visits within limits.
- Cannot delete, merge, or alter core identity records.

#### Manager / M&E Staff

- See all ECDCs, practitioners, visits, dashboard, and data quality queue.
- Correct visit, practitioner, and ECDC fields.
- Resolve unmatched records.
- Cannot manage users or hard delete.

#### Administrator

- Manage users, roles, and staff mappings.
- Restore, archive, or delete records.
- Reprocess Kobo submissions.
- Configure lookup lists and system settings.

#### Library / View-Only

- Read-only access to relevant views.
- No raw Kobo payload access by default.

### Recommended Security Work

- Revoke unnecessary `anon` grants.
- Add RLS tests for each role.
- Do not rely on frontend hidden routes.
- Add webhook authentication for `kobo-fetch`.

## 5. Field Staff Usability

Field staff need fast answers, not database-shaped screens.

### Common Useful Functions Currently Missing Or Incomplete

- My visits
- My planned visits
- Today / this week
- ECDCs needing follow-up
- Practitioners I recently visited
- Submitted but not processed
- Submission needs admin review
- Offline or low-bandwidth-friendly summary views
- Simple correction request: "Something is wrong with this record"

### Recommended Field Staff Pages

#### My Work

- Planned visits
- Recent visits
- Incomplete or problem submissions

#### Find Practitioner / ECDC

- Quick search
- Phone/contact
- Location
- Last visit
- Notes

#### Correction Request

- Let field staff flag incorrect data without directly changing sensitive records.

This would make the app feel like a daily tool rather than just a reporting database.

## 6. Admin And Monitoring Team Usability

Admin and M&E users need confidence, cleanup tools, and reporting.

### Useful Missing Or Incomplete Functions

- Reprocess failed or partial Kobo submissions from the monitor.
- Resolve unmatched practitioner and ECDC values.
- Merge duplicate practitioners.
- Restore deleted records.
- Review all changes for a record in one timeline.
- Export cleaned reports by date range, area, staff member, group, and outreach type.

### Data Quality Dashboard Ideas

- Failed submissions
- Partial submissions
- Unmatched records
- Duplicate candidates
- Visits without practitioner
- ECDCs without coordinates
- Practitioners without ECDC
- Old attendance counts
- Missing contact numbers

### Recommended Admin Pages

- Data Quality
- Submission Monitor
- Correction Review
- Reports
- User & Staff Management
- System Settings / Kobo Lookups

## 7. Highest-Value Next Steps

Prioritize in this order.

### 1. Stabilize Trust

- Fix reprocess Edge Function.
- Fix `hard_delete_outreach_visit`.
- Add webhook authentication.
- Clean up `anon` grants.

### 2. Build Data Correction Workflow

- Unmatched queue.
- Resolve, link, and create actions.
- Correction reason.
- Restore soft-deleted records.

### 3. Clarify Role Access

- Define role matrix.
- Test RLS.
- Make frontend match database permissions.

### 4. Improve Staff-Facing Workflows

- My Work.
- ECDC/practitioner quick lookup.
- Correction request flow.

### 5. Improve Admin/M&E Workflows

- Data quality dashboard.
- Reporting exports.
- Duplicate merge.
- Reprocess UI.
