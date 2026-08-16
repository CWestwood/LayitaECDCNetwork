# Layita ECDC Network: Codebase Review and Rework Plan

**Review date:** 16 August 2026  
**Scope:** React/Vite frontend, Supabase migrations and linked schema, RLS and RPCs, Edge Functions, Kobo processing, automated checks, user-requested functionality, maintainability, performance, and user experience.  
**Review posture:** Read-only. No application or database code was changed as part of this review.

## User-feedback source

`Task Sheet.txt` is now populated with the detailed user feedback and is the authoritative source for the request mapping in this report. `Feedback.md` is currently byte-for-byte identical to it. The earlier `docs/ui-review-2026-07-07.md` remains useful historical context, but the task sheet adds substantially more detail about outreach reporting, practitioner lifecycle, training, route planning, Kobo discrepancies, and specific records that need correction.

## Executive summary

The application has a sound product concept and should be reworked rather than rewritten. Its strongest ideas should remain: a clean white Layita-branded interface, sidebar navigation, a map-centred ECDC directory, practitioner and visit detail drawers, simple operational dashboards, Kobo as the offline capture path, and Supabase as the security and data-integrity boundary.

The immediate problem is not visual bloat. It is a live frontend/database contract mismatch. The owner has confirmed that `20260816154456_remote_schema.sql` was intentionally generated with `supabase db pull` after repairing migration history, so it should be treated as the authoritative capture of the current live structure rather than as an accidental rollback. That live structure differs from several July migrations while the frontend still depends on the affected objects. As a result, the application can build successfully while important workflows fail at runtime.

The highest-priority findings are:

1. **The pulled live schema exposes broken frontend contracts.** Compared with the July migration history, the live structure lacks the data-quality summary view, correction requests, restore functions, unmatched-resolution function, ECDC merge function, external-ID resolvers, and training date columns. It also has a two-argument practitioner merge and requires planned-visit assignment. The UI calls the absent or incompatible interfaces.
2. **All six soft/hard delete RPCs have SQL errors in the live database.** `supabase db lint --linked --level warning` reports invalid aggregate queries in each function. The hard-delete visit function additionally refers to an undeclared `v_deleted_name`.
3. **Several requested features are visibly implemented but operationally broken by the contract mismatch.** Training dates, optional outreach assignees, data-quality resolution/merging, and recycle-bin restore are the clearest examples.
4. **The frontend has accumulated avoidable structural and styling bloat.** There are about 7,030 code lines and 5,496 CSS lines, including 1,800+ lines in `practitioners.css`, repeated page shells, repeated authentication queries, 117 inline-style blocks, legacy files, and oversized feature components.
5. **The quality gates give false confidence.** `npm run lint` passes because ESLint only checks `.js/.jsx`; virtually all live UI code is `.ts/.tsx`. TypeScript is not a direct dependency and the `tsconfig` has no strict settings. The production build succeeds, but emits a 1.65 MB minified main chunk (488.66 kB gzip) and warns about chunk size.
6. **Role handling is inconsistent between UI, RLS, and the documented role model.** Managers are permitted in some RLS policies but are redirected away from all admin/quality routes. “Staff” currently means any non-administrator, including manager and library users. “My Work” ownership depends on case-insensitive name matching rather than an ID relationship.
7. **User feedback is partly implemented and worth preserving.** Date and staff filters, raw Kobo detail, linked practitioner/ECDC views, planning, exports, merged quality tabs, training-date controls, confirmation, and consistent delete icons are already represented in the UI. The fuller task sheet also identifies unimplemented needs: a precise outreach reporting table, practitioner inactivity/reactivation history, holiday training management, chief/headman grouping, filtered select-all, route planning, multiple practitioners per outreach, and governed correction of missing/duplicate Kobo records. The rework should consolidate and repair existing features while adding these workflows.

## Current architecture

```text
KoboToolbox
    -> kobo-fetch Edge Function
        -> raw payload + processing status
        -> shared processSubmission()
        -> ECDC / practitioner / training / visit records

React/Vite SPA
    -> Supabase Auth
    -> PostgREST tables/views
    -> privileged RPCs
    -> reprocess-kobo Edge Function

Supabase PostgreSQL
    -> operational tables
    -> RLS policies and role helper
    -> audit triggers/views
    -> Kobo monitoring and correction objects
```

This is an appropriate architecture for the project’s scale. The rework should make the boundaries explicit:

- PostgreSQL owns authorization, constraints, atomic corrections, merges, deletes/restores, and reporting aggregates.
- Edge Functions own authenticated ingestion/reprocessing and Kobo-to-domain mapping.
- React owns presentation, task flow, local form validation, and cache coordination—not data-integrity rules.

## Verified baseline

### Repository and automated checks

- The production Vite build succeeds.
- The Kobo processor fixture test passes.
- ESLint exits successfully, but only covers `.js/.jsx` and therefore does not validate the live TypeScript application.
- No frontend component, hook, RLS, migration-reset, or browser end-to-end test suite is present.
- A visual browser smoke test could not be completed because no in-app browser instance was available. Authenticated pages were therefore assessed from source, existing review notes, and the linked schema. No test credentials were available.

### Bundle and code shape

| Measure | Current result | Meaning |
| --- | ---: | --- |
| Source code | ~7,030 lines / 68 files | Moderate application size |
| Feature CSS | ~5,496 lines / 11 files | Disproportionately large and repetitive |
| Inline style blocks | 117 | Styling is split between CSS and components |
| `any` casts | 18 | Weak domain/API typing |
| `!important` rules | 38 | Indicates cascading/layout conflicts |
| Main production JS chunk | 1,650.78 kB minified / 488.66 kB gzip | All major routes and export libraries are loaded eagerly |
| Production CSS | 110.74 kB / 21.79 kB gzip | Consolidation opportunity |

### Linked database snapshot

Migration history is aligned by timestamp between local and remote, including `20260816154456`; however, that newest migration is untracked in Git. Aggregate-only data checks found:

| Metric | Count |
| --- | ---: |
| Active practitioners | 177 |
| Active ECDCs | 158 |
| Active visits | 275 |
| Planned visits | 0 |
| Training rows | 166 |
| Unresolved unmatched records | 27 |
| Failed or partial submissions | 53 |
| Practitioner names that are UUIDs | 0 |
| ECDC names that are UUIDs | 1 |

The current processor’s identifier guards appear to have stopped new practitioner UUID-name corruption, but historical cleanup and one remaining ECDC issue still need attention.

### Phase 0 backup record

On 16 August 2026, a new backup of the linked live project was created at `C:\Users\westw\AppData\Local\LayitaECDCNetwork\backups\20260816-phase0-live`. It is outside both the repository and the OneDrive-synchronised workspace. The temporary workspace copy was removed after byte-for-byte checksum verification.

| File | Size | SHA-256 |
| --- | ---: | --- |
| `roles.sql` | 297 bytes | `25873CEC56A2CC6514E204F420231777F85C03DA818CAA7090CDCDFA89776ECD` |
| `schema.sql` | 64,788 bytes | `4E69E5F9781F1E0B24510BC5DF7CF25D493352F53BC23B16EE9FE80543F662F6` |
| `data.sql` | 420,469 bytes | `0751EB2C9A9242347A3AAF3EADF666B5823ECE79AAA915527E4066ED1659C665` |

The data dump contains 45 `COPY` sections across the `auth`, `public`, and `storage` schemas. The schema dump contains 16 tables, 15 functions, 4 views, 40 policies, and 5 triggers. `README.md` in the backup directory records the restore order and limitations; `health-snapshot.json` records aggregate comparison values without row-level data. Because the dump includes authentication and operational data, it must be treated as sensitive. File integrity and structure were checked, and the owner subsequently confirmed that a test restore completed successfully.

## Critical Supabase findings

### 1. The pulled live schema does not satisfy current frontend contracts

`supabase/migrations/20260816154456_remote_schema.sql` was intentionally created by `supabase db pull` after migration-history repair. It is applied remotely, currently untracked, and is the best available local record of the live database at review time. Relative to the July migration history, it records a live structure that:

- drops `correction_requests` and its policies/indexes;
- drops `data_quality_summary`;
- drops `get_deleted_ecdcs()`;
- drops `merge_ecdcs(uuid, uuid, jsonb)`;
- drops the three restore RPCs;
- drops `resolve_unmatched_submission(...)`;
- drops both external-ID resolver RPCs;
- drops all eight training date columns;
- makes `planned_visits.assigned_to` non-null;
- replaces the field-choice practitioner merge with a simpler two-ID merge;
- reintroduces broken delete-function bodies; and
- grants table privileges on `planned_visits` to `anon` (RLS currently prevents access, but the grant is unnecessary and confusing).

This conflicts directly with the frontend:

| Frontend expectation | Live database state | Result |
| --- | --- | --- |
| Reads `data_quality_summary` | View absent | Data Quality summary and shell prefetch fail |
| Calls `resolve_unmatched_submission` | Function absent | Queue actions fail |
| Calls three-argument `merge_practitioners` | Only two-argument version exists | Practitioner merge fails |
| Calls `merge_ecdcs` | Function absent | ECDC merge fails |
| Calls three restore RPCs | All absent | Recycle-bin restore fails |
| Calls `get_deleted_ecdcs` | Function absent | Deleted ECDC tab fails |
| Reads/writes training date columns | Columns absent | Practitioner query/edit fails or returns API errors |
| Allows an unassigned plan | `assigned_to` is `NOT NULL` | Create plan fails when “Unassigned” is selected |
| Processor calls external-ID resolvers | Functions absent | It falls back to scanning up to 5,000 records |

Do not edit the pulled, already-applied migration to rewrite history. Preserve it as the live baseline, then use forward repair migrations. The owner has confirmed that the current database is up to date and that older backups contain no additional information or requests. The Phase 0 dump therefore represents the recovery baseline; the absent correction rows and training dates should be treated as non-existent rather than pending historical recovery.

### 2. Delete and recycle-bin functions are not safe to use

Live schema lint reports an error in each of:

- `soft_delete_practitioner`
- `soft_delete_ecdc`
- `soft_delete_outreach_visit`
- `hard_delete_practitioner`
- `hard_delete_ecdc`
- `hard_delete_outreach_visit`

Each combines `COUNT(*)` with a non-aggregated `name` or `date` in a `SELECT ... INTO` without grouping. Use a direct `SELECT name/date INTO ...`, followed by `IF NOT FOUND`, instead. `hard_delete_outreach_visit` also builds audit JSON with undeclared `v_deleted_name` rather than the selected date.

The delete functions are `SECURITY DEFINER`. Every such function should have an explicit safe `search_path`, revoked public/anonymous execution, a role check, deterministic return shape, and integration tests for unauthorized, not-found, valid, repeated, and FK-dependent cases.

### 3. Schema has too many competing sources of truth

There are four schema representations:

- `supabase/migrations/*` (the only suitable deployment source of truth);
- `supabase_setup.sql` (large stale dump);
- `layita-app/supabase_schema` (small older snapshot); and
- the live linked schema.

This makes it easy to regenerate a migration that undoes intentional work. Keep immutable forward migrations as the source of truth. Replace the other schema artifacts with either generated, clearly labelled snapshots or remove/archive them after confirming they are not used operationally.

### 4. Data-model integrity needs tightening

- `ecdc_list.number_children` is text even though it is used numerically.
- Area exists as both `ecdc_list.area` text and `area_id`; practitioner group exists as both text and `group_id`.
- User-to-staff ownership is inferred through `lower(profiles.name) = lower(layita_staff.name)`. Renaming or duplicate names break assignment and RLS ownership.
- Many operational columns are nullable and several coded fields accept arbitrary text, creating label/code drift (`caregiver` versus `Caregiver Training`, for example).
- Training is a wide one-row-per-practitioner record. It works for a fixed curriculum but makes dated history, repeat attendance, provider, evidence, and expiry awkward.
- Planning stores both `practitioner_id` and a copied `practitioner_name`, inviting drift.
- An outreach visit has only one `practitioner_id`, but the task sheet includes a real visit involving two practitioners at the same ECDC. The current model cannot represent that accurately without duplicating the visit and its totals.
- Practitioner `status` can represent active/inactive/interested, but there is no governed status history, reason, effective date, reactivation event, or preservation of the practitioner’s original group.
- Chief and headman are free text, so spelling differences prevent reliable grouping and filtering.
- Existing BookDash fields (`children_books`, `books_per_child`, and `books_to_practitioner`) do not clearly distinguish children receiving books from the total number of books distributed.
- `photos_taken` does not answer the user’s separate question of whether photos were uploaded to the Google album.
- Audit triggers cover updates on ECDCs, practitioners, visits, and plans, but insert/delete/system actor/correction-reason coverage is incomplete.

Recommended model decisions:

1. Add an explicit nullable `profiles.layita_staff_id` FK (unique where non-null) and use it in RLS and “My Work”.
2. Make IDs canonical; keep names as presentation snapshots only when there is a reporting reason.
3. Move `number_children` to integer with a safe cleanup migration and constraints.
4. Choose canonical `area_id` and `group_id`; retain legacy text only during a measured migration window.
5. Store canonical codes in the database and translate them to labels in the UI.
6. Replace wide training flags/dates with `training_events(practitioner_id, training_type, completed_on, provider, notes)` if repeat/history reporting is required. If it is not, restore the date columns and explicitly document the simpler fixed model.
7. Add an `outreach_visit_practitioners` junction table and treat the current `practitioner_id` as a compatibility field during migration. Store visit-level totals only once.
8. Add practitioner lifecycle events (`status`, `reason`, `comment`, `effective_on`, `changed_by`) and preserve group assignment history independently of active/inactive status.
9. Normalize chief/headman values through managed reference records or an alias/canonical-value layer, while retaining the original submitted spelling for audit.
10. Rename or replace ambiguous outreach metrics with explicit fields for enrolled parents, attending parents, children receiving books, books distributed to children, books left with the practitioner, and Google-album upload status.

### 5. RLS and roles do not match the intended application

- All authenticated users can read active ECDCs, practitioners, visits, plans, staff, groups, training, labels, and landmarks. This includes the nominal library role and every data capturer.
- Data capturer ownership for visit write policies uses name matching.
- Managers may update practitioners/training/visits under RLS, yet the frontend’s `AdminRoute` blocks them from quality/audit tooling.
- Planned visits are readable by all authenticated users; “My Work” filtering in React is therefore a convenience, not an access boundary.
- Managers may read unmatched and audit data in RLS, while the UI hides those routes.
- Staff management performs raw client-side profile inserts/deletes even though profiles are tied to `auth.users`.

Create a single capability matrix and implement it three times from the same specification: RLS/RPC rules, route guards, and visible actions. Recommended capabilities are `view_operational`, `manage_own_visits`, `edit_operational`, `resolve_quality`, `reprocess_kobo`, `manage_plans`, `restore_records`, `hard_delete`, and `manage_users` rather than scattered `isAdmin` checks.

### 6. Kobo ingestion is improved but still needs hardening

Positive findings:

- Raw payloads and processing state are preserved.
- Visit upsert by `kobo_instance_id` is idempotent.
- Mapping, update, interested, support/caregiver/literacy flows are explicitly handled.
- Identifier-like values are prevented from being stored as human names.
- The processor fixture covers UUID variants, interested practitioners, unmatched input, negative transport, and reprocessing.

Remaining work:

- Webhook authentication is enforced only when `KOBO_WEBHOOK_SECRET` exists. The production secret inventory contains `KOBO_TOKEN_LAYITA` and `KOBO_TOKEN_REHAB`, but not `KOBO_WEBHOOK_SECRET`; neither deployed custom name is referenced by the current repository source. The current `kobo-fetch` source therefore does not perform its intended custom-header check with the deployed secret names. Align the code and configured secret name, fail closed when it is absent, and retire or document the two unused names after confirming no older deployed code relies on them.
- Both deployed Edge Functions currently have JWT verification enabled. Confirm that Kobo is configured to provide an accepted Supabase authorization header as well as the aligned custom webhook secret; otherwise a direct Kobo webhook will be rejected at the gateway before function-level secret validation runs. Conversely, any caller that can satisfy the gateway JWT check currently reaches the function without the intended custom-secret check because of the name mismatch.
- Avoid the 5,000-record fallback by restoring and testing external-ID resolvers.
- `labelCache` is unbounded for the lifetime of a warm worker; small today, but it should be bounded or based on known lists.
- `logUnmatched` can create duplicate unresolved rows on repeated processing. Add an idempotency constraint/upsert strategy.
- Training reprocessing writes all booleans from a payload; define whether omissions mean false or “leave unchanged.”
- Add fixtures directly derived from each Kobo form branch and validate normalized output field by field.
- Record system actors and reprocess attempts in the audit model.

## Frontend and maintainability findings

### 1. Authentication is duplicated instead of provided once

Every call to `useAuth()` creates its own state, Supabase session hydration, auth subscription, and role query. Route guards, Sidebar, buttons, and pages call it independently. Sidebar then performs a separate profile query for name and role.

Replace this with one `AuthProvider` at the application root that exposes session, user, profile, staff link, role, and capabilities. This reduces network requests, loading flicker, and inconsistent route/action decisions.

### 2. The page shell is repeated on every feature

Nearly every feature renders its own `.page` plus `<Sidebar />`; three quality pages add another wrapper; the `pages/` directory is mostly one-line re-exports. Use a protected `AppShell` route with `<Outlet />`, one Sidebar, one responsive main region, and route metadata. Keep the quality tabs as a nested layout.

This permits removal of most page wrapper files and fixes shell consistency without changing the visual concept.

### 3. Data access is fragmented

TanStack Query is a good choice, but components still fetch and mutate Supabase directly:

- Sidebar profile loading;
- practitioner and visit edit forms;
- staff management;
- visit edit permission lookup; and
- duplicated quality/audit prefetch queries.

Move all server interaction into typed query/mutation modules. Define query-key factories, return domain models rather than raw Supabase shapes, invalidate related keys in one place, and send changed fields only.

### 4. Type safety and quality tooling are incomplete

- ESLint checks only JS/JSX.
- TypeScript is not a direct development dependency.
- `tsconfig.json` only defines JSX and an alias; there is no strict mode or no-emit check.
- Supabase response shapes are hand-written and normalized with `any` casts.
- Mixed JS and TS utilities remain.
- `index.html` points to `/src/main.jsx` while the source entry is `main.tsx`; Vite currently resolves/builds it, but the mismatch should be removed.

Add TypeScript, `typescript-eslint`, strict compiler options, generated Supabase database types, `lint`, `typecheck`, `test`, and `build` CI jobs. Convert the small JS utilities/client to TS.

### 5. Styling is the largest visible source of bloat

The design is worth retaining, but styling has grown by appending page-specific rules:

- `practitioners.css` is roughly 49.6 kB and over 1,800 lines.
- `outreachVisits.css` is roughly 34.9 kB with repeated responsive sections.
- The same Raleway declaration is repeated across many selectors.
- Shared component shapes are copied under `p2-`, `ov-`, `dq-`, `ecdc-`, `da-`, and `op-` namespaces.
- 117 inline style blocks and 38 `!important` declarations make responsive behavior harder to reason about.
- Fonts are imported from CSS more than once; Space Mono and DM Sans appear imported but are not the intended site font.

Create a small design-system layer while keeping the current appearance:

- tokens: colours, spacing, typography, radii, shadows, breakpoints;
- primitives: Button, IconButton, Input, Select, SearchField, Badge, StatCard, EmptyState, Spinner, ConfirmDialog, Drawer, DataTable, PageHeader;
- layouts: AppShell, split list/detail, map/directory, admin tabs;
- one global reset/font declaration; and
- feature CSS only for genuinely feature-specific layout.

Avoid a large UI framework unless there is a clear accessibility or delivery benefit; it would change the concept and add more weight than this app needs.

### 6. Dead and confusing artifacts should be removed after proof

Likely removal candidates include:

- legacy `src/components/Login.jsx` and its broken imports;
- `src/components/Dashboard.css` and `Sidebar.css`;
- Vite starter `App.css`, `react.svg`, and `public/vite.svg`;
- unused `layitalogo.jpg` and `flame.svg` if reference checks confirm they are not deployed assets;
- unused hooks such as `useEcdcs`, `useStaff`, and `useUnmatchedQueue` if the refactor does not adopt them;
- empty `src/config` and `src/hooks` directories;
- redundant one-line page wrappers; and
- stale delete-design/root schema documents once their useful content is consolidated.

Delete only after import-graph, build, and browser regression checks. Documentation that explains audit/delete intent should be consolidated, not blindly discarded.

### 7. Performance needs simple, targeted work

- All routes are eagerly imported.
- PDF, canvas, XLSX, Leaflet, and all admin modules contribute to the initial graph.
- Dashboard and visit aggregates are calculated after fetching row sets.
- Several lists fetch complete tables and filter in the browser.
- Quality shell prefetches all four admin datasets on every quality route, including up to 1,000 audit rows and 500 submissions.

Use route-level `lazy()` boundaries, dynamically import export libraries on demand, lazy-load Leaflet on the map route, move reporting aggregates to views/RPCs, and add pagination/virtualization only where measured data volume justifies it.

### 8. Feedback and error handling are inconsistent

The application calls `toast.*` in many mutations but never renders Sonner’s `<Toaster />`, so feedback may be invisible. Six `alert()` calls remain, staff management ignores returned Supabase errors because those calls do not throw automatically, and many pages display no query error state.

Mount one notification provider, add a reusable error/empty/loading pattern, use accessible confirmation dialogs, and ensure mutations inspect `{ error }` consistently.

## Test-user request mapping

Status reflects the current frontend plus the linked schema, not appearance alone.

| Requested outcome | Current status | Rework decision |
| --- | --- | --- |
| Dashboard visit-type boxes aligned | Partial | Replace bespoke bars with shared equal-size stat/type cards and test wrapping |
| Raleway everywhere | Mostly present | Declare once globally; remove repeated declarations and unused font imports |
| Visits by staff as a table and labels formatted | Implemented | Preserve; move aggregates server-side later |
| Dates consistently `dd-mm-yyyy` | Partial | Use one formatter in all display components; My Work, audit/monitor, and visit edit still differ |
| Hide My Work from administrators | Implemented | Preserve, but define which of manager/library/data-capturer should see it |
| Stop UUIDs appearing as names | Partly fixed | Keep processor guards, restore external resolvers, clean one ECDC, add constraints/monitoring |
| Bin icons and confirmations for practitioner/ECDC delete | Implemented/partial | Preserve shared delete control; repair RPCs and use one accessible dialog |
| Training dates editable | UI present, backend broken | Choose training-event model or restore date columns; then test query/edit/audit end to end |
| Practitioner change summary then confirm | Implemented | Preserve; improve to old → new values and require correction reason for sensitive changes |
| Refresh data after practitioner save | Implemented | Preserve query invalidation; standardize mutation hooks |
| ECDC table view | Partial | Add a true map/table view toggle using a shared DataTable, not only the narrow directory/report list |
| Add selected ECDCs to planning | Implemented/partial | Preserve; add bulk plan creation and clear per-ECDC/practitioner selection semantics |
| Filter outreach by date range | Implemented | Preserve; validate inclusive dates and synchronize filters to the URL |
| Filter outreach by data capturer | Implemented | Preserve; combine reliably with date/type/status filters and exports |
| Show Literacy Promotion as an outreach type | Implemented | Preserve canonical code/label handling |
| Remove Interested from outreach types | Partial | Exclude it from visit reporting and migrate misclassified records into the practitioner-interest workflow |
| Remove Update ECDC Details from outreach types | Implemented in some lists | Treat it as a data-update event and exclude it consistently from visit lists, dashboard totals, and exports |
| Restrict valid outreach types | Not enforced | Define canonical values: Caregiver Training, Literacy Promotion, Practitioner Support, and Other for exceptional events; validate in Kobo, database, and UI |
| Correct the current Other record that is actually an interested practitioner | Not done | Handle as a governed data correction with audit trail; do not hard-code the person in application logic |
| Stop spreadsheets showing Unknown practitioner | Partial | Repair missing links through the quality queue; export both practitioner and ECDC context and flag unresolved rows explicitly |
| Add Not as planned status | Not implemented as a clear status | Define outcome semantics across `outreach_happened`, `did_instead`, and planning status; expose a canonical Not as planned option |
| Show ECDC name in outreach table/export | Available in nested data, not a list column | Add a visible/exportable ECDC column |
| Show transport type, cost, and kilometres | Partly available | Add explicit columns with currency/distance formatting and filter/export support |
| Show enrolled parents, attending parents, and attendance rate | Partly available | Add the two source counts and a consistently defined calculated percentage; never store only the percentage |
| Show children receiving books, books distributed, and books left with practitioner | Ambiguous/partial | Split the current ambiguous BookDash fields, migrate data where possible, and label table/detail/export values clearly |
| Show whether photos were uploaded to the Google album | Not represented | Add a distinct upload-status field/workflow; do not equate it with `photos_taken` |
| Visit delete option | UI present, backend broken | Repair and test delete RPCs first; enable correction of the specified cancelled 29 July visit through the governed delete flow |
| View raw Kobo data | Implemented for admins | Preserve; improve nested payload formatting, labels, copy/export, and PII warning |
| View ECDC and practitioner from visit | Implemented | Preserve; standardize deep-link query parameters |
| BookDash and attendance metrics | Mostly implemented | Correct the aggregate “Books to children” value, which currently repeats the book total in brackets; define denominator semantics |
| Edit Mapping Comments | Not exposed clearly | Add mapping comments to the authorized practitioner/ECDC edit workflow with change preview, reason, and audit history |
| Develop holiday training management | Not implemented | Build training events/sessions, attendance, dates, types, facilitators, and exports rather than adding more booleans |
| Filter or sort by chief/headman | Not implemented | Normalize values first, then add canonical chief/headman filters and sorting |
| Handle chief/headman spelling errors | Not implemented | Replace uncontrolled entry where possible with managed choices plus alias review; retain original Kobo value for audit |
| Mark practitioners inactive with reason/comment | Schema has status only | Add an explicit lifecycle action and reason; inactivity must not overwrite group history or delete the practitioner |
| Reactivate practitioners and retain history | Not implemented | Add reactivation as a lifecycle event and display status/group history |
| Select multiple practitioners from list or map | Implemented/partial | Preserve current selection, align list/map behavior, and make the selection usable for planning |
| Select all matching current filters | Partial | Ensure Select all applies to the full filtered result, clearly distinguishes visible-page versus all-result selection, and supports deselection |
| Plan a day route for selected practitioners | Not implemented | Add an ordered trip/route entity after planning data is stable; use coordinates and expose manual reordering |
| Estimate route distance and transport cost | Not implemented | Treat as a separate routing feature requiring a routing engine, vehicle/cost assumptions, and fallbacks for missing coordinates |
| Make practitioner deletion discoverable | UI present, backend broken | Repair RPCs and make archive/inactivate the normal action; reserve deletion for erroneous duplicate records |
| Some Kobo records exist but are absent from the website | Confirmed risk | Add reconciliation between raw, processed, normalized, and visible records; show the failure reason and safe reprocess/correct actions |
| Capture intended practitioner when outreach does not happen | Not reliably modelled end to end | Make practitioner/plan context mandatory before outcome branching in Kobo and web capture |
| Link one outreach visit to multiple practitioners | Not supported | Add a visit-practitioner junction model and update capture, display, reporting, and duplicate rules |
| Correct a missing/incorrect visit date | Edit flow currently makes date read-only | Add an authorized date correction with reason and audit; resolve the specified 21 April case through this workflow |
| Resolve duplicated Kobo visits | Quality tools are currently broken | Add duplicate detection and merge/void workflow that preserves one visit and its provenance; resolve the specified 5 June case |
| Outreach Planning page and export | UI present, backend mismatch | Repair optional assignee, add edit/reassign/cancel/complete, bulk create, validation, and export tests |
| Merge Kobo Monitor, Data Quality, Audit | Implemented as tabs | Preserve shell; repair missing backend objects and allow manager capabilities where intended |
| Recycle Bin sidebar and font | Implemented visually | Preserve shell/font; repair list/restore/delete RPCs |
| Future Google Calendar sync | Deferred by request | Keep out of the current rework; model stable IDs/statuses so future sync is straightforward |

### Specific data corrections recorded in the task sheet

These are operational correction cases, not features to hard-code:

- Correct or remove the cancelled outreach entry dated 29 July.
- Review the 30 April visit involving Noluphiwo Rayi and Ntombizangoku Sibhenya; represent it as one visit linked to two practitioners at the same ECDC.
- Add or correct the 21 April visit for Noluthando Makhaula through an audited date/record correction workflow.
- Resolve the duplicated 5 June Kobo outreach submissions without double-counting visit metrics.
- Reclassify the current `Other` outreach record that actually represents a practitioner interested in joining the network.

Before changing any of these records, identify them by immutable IDs, compare raw Kobo payloads with normalized rows, take a backup, record the correction reason, and verify downstream totals.

## UX improvements that preserve the design concept

### Global navigation and shell

- Keep the left desktop sidebar and five-item mobile bottom navigation.
- Make Dashboard, My Work, ECDCs, Practitioners, and Visits the primary destinations; group planning and quality/admin tools under role-appropriate secondary navigation.
- Persist sidebar collapse preference locally.
- Add page-level breadcrumbs only inside deep workflows, not to every simple page.
- Use route-aware page titles and a consistent mobile safe-area/padding treatment.

### Dashboard

- Make KPI/type/staff entries clickable into pre-filtered lists.
- Exclude update-only records from visit metrics or display them as a separate “record updates” measure.
- Make the reporting period explicit and keep the year selector.
- Use a server aggregate view so every screen shares the same definitions.

### My Work

- Make this the field-user home: Today, This Week, Overdue, Recent, and Needs Attention.
- Show practitioner, ECDC, area, contact action, plan type, last visit, and status.
- Add “request correction” rather than direct core-record editing for data capturers.
- Provide useful “profile not linked to staff” guidance instead of an empty screen.

### Practitioners and ECDCs

- Retain list/detail and map/detail patterns.
- Add a real ECDC table toggle with the same filters and selection model as the map.
- Use one shared selection toolbar and make bulk planning explicit.
- Make filtered Select all behavior explicit: select the whole filtered result or only the current page, with the count always visible.
- Add canonical chief/headman filtering after spelling variants have been resolved through managed values/aliases.
- Add clear Inactivate and Reactivate actions with effective date, reason, comment, and visible status/group history.
- Make Mapping Comments editable by authorized roles through the same reviewed, audited mutation pattern as other sensitive fields.
- Show data source, last updated, stale attendance, unmatched/duplicate warnings, and correction history to authorized users.
- Use searchable comboboxes rather than large native selects/datalists for practitioner/ECDC linking.

### Visits

- Retain the chronological list and detail drawer.
- Offer a reporting table with date, practitioner(s), ECDC, data capturer, canonical type/outcome, transport, cost, kilometres, parent counts/rate, BookDash counts, and photo-upload status. Use compact cards on mobile.
- Add URL-backed filters so a report can be bookmarked/shared.
- Keep Interested and ECDC-update events out of outreach reporting; use separate practitioner-interest and record-update workflows.
- Capture the intended practitioner even when a planned outreach does not happen.
- Support multiple practitioners on one visit without duplicating visit-level counts.
- Present raw Kobo data as grouped sections with friendly labels while retaining a technical raw view for admins.
- Add a review-and-confirm step to visit edits, including date corrections, changed-field-only payloads, correction reason, and immediate query refresh.

### Planning

- Support bulk creation from selected ECDCs/practitioners.
- Allow unassigned plans if that remains the intended workflow.
- Add edit, reassign, cancel, complete, and link-to-completed-visit actions.
- Split plans into upcoming, unassigned, overdue, and completed/cancelled.
- Add an optional day-trip route builder only after selection/planning is stable: manual ordering first, then routing-engine distance and configurable transport-cost estimates.
- Flag selected practitioners/ECDCs with missing or low-confidence coordinates rather than silently producing misleading routes.
- Keep CSV export; test Excel compatibility and formula-injection escaping.

### Training

- Treat holiday training as sessions/events rather than additional permanent practitioner flags.
- Capture training type, date, venue, facilitator, attendees, attendance/completion, notes, and optional evidence.
- Allow bulk attendance entry from selected practitioners while retaining each person’s history.
- Provide upcoming-session planning, historical search/filtering, and export.

### Quality and audit

- Keep the combined tabbed shell.
- Turn the first tab into an action queue ordered by severity and age.
- Each item should show context, recommended action, effect preview, confirmation, reason, actor, and result.
- Reprocessing should preview duplicate/idempotency risk and show new status inline.
- Merge should display every affected visit, plan, training event, and link before confirmation.
- Audit needs filters by record, actor, table, date, action, and source.

### Staff management

- Replace the two raw database tabs with one user lifecycle workflow: invite user, assign role, link staff identity, deactivate/reactivate, reset access, and review activity.
- Perform Auth administration in an authenticated admin Edge Function or server path using the service role—never from the browser.
- Do not delete profiles or staff that own history; deactivate them.

## Target frontend structure

One reasonable structure, without introducing a large framework, is:

```text
src/
  app/
    App.tsx
    providers.tsx
    routes.tsx
    AppShell.tsx
  components/
    Button.tsx
    ConfirmDialog.tsx
    DataTable.tsx
    Drawer.tsx
    EmptyState.tsx
    FormField.tsx
    PageHeader.tsx
  features/
    dashboard/
    ecdcs/
    practitioners/
    visits/
    planning/
    quality/
    staff/
  lib/
    auth/
    queryKeys.ts
    supabase.ts
    database.types.ts
    format.ts
  styles/
    tokens.css
    global.css
    components.css
```

Each feature should expose routes/components plus typed query and mutation functions. Avoid generic abstraction beyond recurring UI or domain patterns; the goal is less code and clearer ownership, not a new internal framework.

## Phased rework plan

### Phase 0 — Recover intent and freeze the baseline

- [x] Treat the populated `Task Sheet.txt` as the accepted feedback baseline and retain `docs/ui-review-2026-07-07.md` as historical context.
- [x] Confirm the 16 August migration intent: it was generated with `supabase db pull` after migration-history repair to capture the current live structure.
- [x] Preserve the pulled migration and review artifacts in version control on the active development branch. Merging into the main line is intentionally deferred until the work is functional and its gates pass.
- [x] Create a current live roles/schema/data backup outside the repository and OneDrive; verify its checksums and record its restore order.
- [x] Resolve historical-backup scope: the owner confirmed that the current database is up to date and previous backups contain no additional information or requests.
- [x] Record deployed Edge Function metadata: `kobo-fetch` is active at version 37 with JWT verification; `reprocess-kobo` is active at version 2 with JWT verification.
- [x] Record required secret names from source (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `KOBO_WEBHOOK_SECRET`) without recording values.
- [x] Confirm that the repository-root and frontend `.env` files are ignored by Git and are not tracked. The local files also define `KOBO_API_KEY`, but the current Edge Function source does not read that variable.
- [x] Verify configured production secret names without recording values. Supabase supplies the required default `SUPABASE_URL` and legacy `SUPABASE_SERVICE_ROLE_KEY`. The only custom names are `KOBO_TOKEN_LAYITA` and `KOBO_TOKEN_REHAB`; the source-required `KOBO_WEBHOOK_SECRET` is absent, and the two configured custom names are unused by the current repository source.
- [x] Capture an aggregate health snapshot and backup manifest for rollback comparison.
- [x] Complete a test restore of the Phase 0 backup; the owner confirmed that the restore succeeded.

**Exit gate status: complete.** The feedback baseline, migration intent, historical-backup decision, version-control baseline, current backup, checksum verification, successful restore test, aggregate snapshot, Edge deployment metadata, secret-name inventory, and branch-first rollout strategy are all recorded. The discovered webhook-secret mismatch remains a Phase 2 ingestion-security repair item and should be resolved before another production deployment.

### Phase 1 — Restore a reliable database contract

Branch implementation status:

- [x] Repair all six delete functions with fixed `search_path`, authorization, audit output, and history-preserving FK behavior.
- [x] Restore the ECDC deleted-record listing and all three restore functions while retaining frontend-compatible signatures.
- [x] Restore field-choice practitioner and ECDC merges; preserve visit participants, plans, training history, and lifecycle data.
- [x] Restore unmatched resolution and both external-ID resolvers with target validation and deleted-record exclusion.
- [x] Rebuild `data_quality_summary` as a security-invoker view, including new staff-link and leader-review metrics.
- [x] Retain the eight legacy training-date fields for current UI compatibility and add normalized `training_courses`/`training_events` history with backfill and synchronization.
- [x] Make `planned_visits.assigned_to` nullable so “Unassigned” remains valid.
- [x] Restore correction requests with status/target/resolution constraints, timestamps, indexes, and owner/reviewer RLS.
- [x] Remove anonymous operational table access, revoke sensitive RPC/trigger execution, and tighten future default privileges.
- [x] Add coordinate, numeric-text, non-negative metric, attendance, source/status, FK, uniqueness, and query-path constraints/indexes without destructive legacy renames.
- [x] Replace binary admin/staff routing with named frontend capabilities aligned to RLS/RPC behavior. Managers can reach quality/audit; Kobo reprocessing, planning, recycle-bin, and user management remain administrator-only.
- [x] Add `outreach_visit_practitioners`, backfill legacy primary links, and keep single-practitioner ingestion synchronized.
- [x] Add practitioner lifecycle events, retained group history, automatic change capture, and explicit unique `profiles.layita_staff_id` ownership. “My Work” no longer joins people by name.
- [x] Add explicit outreach attendance/book/photo fields with calculated attendance rate and legacy synchronization. Add canonical chief/headman records plus aliases and ECDC FKs; current distinct spellings are retained as provisional values requiring review.

Validation completed against a disposable PostgreSQL 17 Supabase container loaded from the Phase 0 schema and all 16 public-data COPY sections:

- both migrations apply successfully to the restored live-data shape;
- database contract tests pass for all six delete RPCs, all restores, both merges, unmatched resolution, external-ID signatures, role denial paths, backfills, metric/training triggers, leader aliases, grants, and `search_path` hardening;
- `plpgsql_check` reports zero errors or warnings for normal and trigger functions;
- generated TypeScript schema output contains the Phase 1 tables and RPCs;
- the Edge processor fixture, frontend lint, and production build pass; and
- the known large-bundle warning remains a later frontend-foundation item.

The full migration history now also applies from zero in an isolated, explicitly named PostgreSQL 17 Supabase container, and the Phase 1 database contract suite passes on that clean schema. This avoids modifying the separate running local Supabase stack. The owner subsequently completed a staging rollout smoke test. That test exposed an ambiguous PostgREST practitioner embed after the multi-practitioner junction was added; the frontend now names the primary-practitioner FK explicitly and displays query errors rather than presenting them as empty filter results. Nothing in Phase 1 has been applied to production.

**Exit gate status:** implementation, clean-history and restored-data migrations, contract/RPC tests, procedural lint, type generation, Edge fixture, frontend lint/build, and the owner’s staging database smoke test pass. The outreach relationship regression is repaired on the branch and requires the next frontend staging deployment for confirmation.

### Phase 2 — Stabilize ingestion and data quality

Branch implementation status:

- [x] Define a fail-closed webhook contract using a dedicated `KOBO_WEBHOOK_SECRET`, constant-time header comparison, POST-only handling, and a 2 MiB payload limit. `kobo-fetch` is configured with gateway JWT verification disabled because Kobo authenticates with the custom secret; `reprocess-kobo` retains JWT verification and an administrator-role check. Do not reuse the outgoing `KOBO_TOKEN_LAYITA` or `KOBO_TOKEN_REHAB` API tokens as the inbound webhook secret.
- [ ] Expand fixtures to every actual XLSForm branch. Current fixtures cover mapping, compact/hash IDs, caregiver/support-style lookup, interested practitioners, unmatched IDs, negative transport, duplicate delivery, ledger multi-practitioner overrides, quarantine, and authentication. Direct workbook inspection remains pending because the required spreadsheet artifact runtime was unavailable in this implementation session.
- [x] Make unmatched logging idempotent with one open issue per submission/field/value, occurrence counts, last-seen timestamps, and an atomic service-only RPC.
- [x] Accept PostgreSQL/deterministic-hash UUID shapes, prevent future UUID-like ECDC names, and migrate the one deterministic malformed ECDC into its referenced canonical ECDC with an audit record.
- [x] Add controlled processing runs with payload hashes, receipt counts, immutable attempts, processor versions, actors, terminal status, result IDs, warnings, and provenance. Reprocessing is capped at 50 validated instance IDs per request and is safe against duplicate visit creation.
- [ ] Reprocess the existing failed/partial submissions only after the Phase 2 migration, Edge Functions, and reconciliation UI reach staging. The tooling is complete; the data operation is intentionally not embedded in a migration.
- [ ] Resolve the existing unmatched entries after importing and reviewing the supplied ledger. The ignored local ledger dry run validates 145 decisions against staging: 91 distinct practitioner IDs and 81 distinct ECDC IDs exist, with zero missing canonical references; 52 decisions are explicitly quarantined. No ledger data has been committed or imported.
- [x] Add explicit system/user/webhook/ledger actor types, source/correlation/provenance fields, correction reasons, deletion actors, and immutable processing/resolution events.
- [x] Add the security-invoker `kobo_reconciliation` view and a frontend action queue covering pending, failed, partial, unmatched, quarantined, missing-visible-record, visible, and resolved states.
- [x] Add multi-practitioner-aware duplicate candidate scoring, source lineage, an audited merge/void RPC that preserves the kept visit and all Kobo source IDs, and frontend keep-A/keep-B resolution controls with a required reason.
- [x] Add an audited visit-correction RPC with an allowed-field list and changed-field-only frontend payloads. Visit date is now correctable with a required reason. The specific 29 July, 30 April, 21 April, 5 June, and misclassified `Other` records still require operator review through these workflows; their immutable IDs and intended outcomes must not be guessed in a migration.

Validation completed on the branch:

- the entire migration history applies from zero in an isolated PostgreSQL 17 Supabase container;
- Phase 1 and Phase 2 database contract suites pass;
- `plpgsql_check` reports no findings for the new processing, unmatched, correction, and duplicate-resolution functions;
- Deno type-checks both Edge Function entry points;
- processor and webhook-auth fixtures pass;
- frontend lint and production build pass, retaining the known large-bundle warning; and
- the ledger dry run passes without exposing or committing its personal-data payload.

Required staging rollout order:

1. Apply `20260816210000_phase2_ingestion_and_reconciliation.sql`.
2. Create a new independent `KOBO_WEBHOOK_SECRET` in staging and configure the Kobo webhook to send it as `x-kobo-webhook-secret`. Retain the two existing Kobo API-token secrets until their external consumers are confirmed.
3. Deploy `kobo-fetch` and `reprocess-kobo` using the checked-in function JWT settings.
4. Deploy the frontend and confirm that the 275 active staging outreach visits load; the previously ambiguous embed is now explicit.
5. Run `node supabase/scripts/import-phase2-resolution-ledger.cjs` for a dry run, then repeat with `--apply` only after reviewing its aggregate output.
6. Use reconciliation to reprocess controlled batches, then resolve unmatched and duplicate candidates with reasons while comparing reporting totals before and after each batch.

**Exit gate status:** the code path makes new delivery/reprocessing idempotent and exposes actionable reconciliation, unmatched, duplicate, and correction workflows. Actual staging deployment, ledger import, controlled historical reprocessing/data corrections, and complete XLSForm-derived fixture coverage remain rollout gates.

### Phase 3 — Establish the lean frontend foundation

1. Add `AuthProvider`, capability checks, app providers, `<Toaster />`, error boundary, and protected `AppShell`.
2. Replace repeated page wrappers with nested routes/layouts.
3. Generate Supabase types; enable strict TypeScript and TS-aware ESLint.
4. Move direct Supabase calls into typed queries/mutations and standardize keys/errors.
5. Create the small shared component/style layer.
6. Remove proven dead files and consolidate CSS incrementally.
7. Add route-level and on-demand dependency lazy loading.

**Exit gate:** lint, typecheck, unit tests, and build pass; route/access tests pass; main bundle is split by route; no user-visible design regression.

### Phase 4 — Complete and repair requested functionality

Implement in this order:

1. Working recycle bin, archive/inactivate actions, and delete confirmations.
2. Working quality summary, missing-record reconciliation, unmatched resolution, merge/deduplicate, and reprocess flows.
3. Canonical outreach types/outcomes and migration of Interested/ECDC-update/misclassified records out of outreach reporting.
4. Outreach reporting table with date/staff filters, ECDC, transport, parent/attendance, BookDash, and photo-upload columns.
5. Multi-practitioner outreach capture and display, including missed-visit practitioner context.
6. Training-event model, holiday training workflow, and practitioner edit confirmation/audit refresh.
7. Practitioner inactivity/reactivation history, Mapping Comments editing, and chief/headman normalization/filtering.
8. Planning with optional assignment, filtered select-all, bulk add, lifecycle actions, and safe export.
9. True ECDC table/map toggle.
10. Dashboard canonical aggregates and click-through.
11. My Work task-oriented view and correction requests.
12. Auth-backed staff lifecycle management.
13. Day-trip route ordering, distance, and cost estimation as a separately tested enhancement after planning and coordinates are reliable.

**Exit gate:** every row in the request mapping has an automated acceptance test and a successful role-appropriate browser test.

### Phase 5 — UX, accessibility, and performance pass

1. Test desktop, tablet, and phone layouts for every route.
2. Verify keyboard navigation, focus management, dialog semantics, labels, contrast, reduced motion, and touch targets.
3. Standardize dates, labels, loading, empty, success, permission, and error states.
4. Test low-bandwidth/loading behavior and cache freshness.
5. Measure route chunks, query counts, and list performance; optimize based on results.

**Exit gate:** core workflows meet agreed accessibility and performance budgets and are usable by both office and field roles.

### Phase 6 — Controlled rollout and cleanup

1. Deploy migrations and Edge Functions to staging first.
2. Run schema-contract, RLS, ingestion, and E2E suites against staging.
3. Seed representative anonymized test cases for every role and Kobo branch.
4. Pilot with the existing test user and capture results against the task sheet.
5. Deploy production with a backup and rollback plan.
6. After a stable period, remove deprecated columns, stale dumps, legacy CSS/components, and temporary compatibility code.

**Exit gate:** test-user sign-off, clean monitoring, no unresolved critical data regressions, and one documented source of truth for schema and product behavior.

## Testing strategy

### Database

- Fresh migration reset from empty database.
- `supabase db lint` with zero errors.
- pgTAP or equivalent tests for RLS by role.
- RPC tests for authorization, valid execution, idempotency, missing records, repeated actions, and FK effects.
- Contract checks that required frontend views/functions/columns exist with exact signatures.
- Multi-practitioner visit tests proving that visit-level transport, parent, and book totals are not double-counted.
- Practitioner inactive/reactivated and group-history tests.

### Edge Functions

- Fixture per Kobo outreach branch and every identifier format.
- Authentication tests for webhook and reprocess endpoints.
- Duplicate webhook, duplicate unmatched, reprocess, partial, and failure recovery tests.
- Tests against a local Supabase instance in addition to mocked query builders.
- Fixtures for missed outreach with an intended practitioner and one visit linked to multiple practitioners.
- Reconciliation tests proving every accepted raw submission is either visible, intentionally non-visit, or in an actionable error state.

### Frontend

- Unit tests for formatting, filters, metrics, capability checks, and payload diffs.
- Component tests for forms, confirmation dialogs, error states, and raw payload display.
- E2E tests per role for login, navigation, edit, plan, delete/restore, quality resolution, reprocess, and user lifecycle.
- Visual checks at representative desktop/tablet/mobile widths.
- Accessibility checks integrated into component/E2E tests.
- Reporting/export tests for every requested outreach column and combined date/staff/type/status filters.
- Selection tests for filtered Select all across list, map, pagination, and planning hand-off.
- Lifecycle tests for inactivate, reactivate, retained group history, and holiday training attendance.

### CI gates

Every pull request should run formatting, TS-aware lint, strict typecheck, unit/component tests, Edge fixtures, production build, migration reset/lint, schema-contract tests, and a small unauthenticated/authenticated E2E smoke suite.

## Decisions required before implementation

1. Should managers have quality/audit/merge access as the existing RLS and role matrix suggest?
2. Should library users see all operational PII or a narrower read-only dataset?
3. Is an unassigned planned visit still required? The UI and task sheet say yes; the live schema says no.
4. Which outreach outcome values are authoritative: Happened, Did not happen, Not as planned, and/or the activity performed instead?
5. Should Interested and Update ECDC Details remain as non-visit submission/event records for audit, or be migrated entirely to dedicated workflows?
6. For a visit involving multiple practitioners, are parent/book totals recorded once for the ECDC/session or separately per practitioner?
7. What exactly is the attendance denominator: parents enrolled for that visit, the practitioner, or the ECDC—and at what date is it measured?
8. Does `support/bookdash_children` currently mean children receiving books or the number of books distributed? Is total books derived from books-per-child or captured independently?
9. Does “Photos uploaded to Google album” need a boolean confirmation, album URL, photo count, uploader, and/or upload date?
10. Should chief/headman be centrally managed choices, and who may add aliases or new canonical names?
11. Which practitioner inactivity reasons are reportable, and who may inactivate/reactivate a practitioner?
12. Do holiday training courses need sessions with multiple attendees and repeat attendance, or only one completion date per practitioner/course?
13. Which routing service may be used, what vehicle/cost assumptions apply, and is straight-line estimation acceptable when road routing is unavailable?
14. Should practitioner/ECDC hard delete remain available, or should archive plus legal retention be the terminal state?
15. Is direct website visit capture still desired after the stabilization work?

## Recommended immediate next action

Proceed to the database-contract work before UI cleanup. Align and test the Kobo gateway/custom-secret authentication contract, then prepare a forward repair migration plus schema-contract/RLS tests. Keep changes isolated on the active development branch and merge only after the relevant functionality and gates pass. Once the database matches the agreed application contract, establish the shared app shell/auth/type/testing foundation, then complete the user-requested workflows while consolidating CSS and components.

That sequence keeps the successful design concept, protects live data, avoids rebuilding broken assumptions, and reduces bloat as part of feature completion rather than through a risky standalone rewrite.
