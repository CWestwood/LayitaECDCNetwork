# UI Functionality Review

Date: 2026-07-05

This document captures the browser-backed UI review for the Layita ECDC Network monitoring site. The review focuses on day-to-day usability for office-based staff, with mobile support for field staff who may need quick access while visiting centres.

## Executive Summary

The current interface has the right core areas: dashboard, ECDC map, practitioners, visits, audit, Kobo monitor, deleted records, data quality, staff management, and a new My Work view. The main gap is that several screens still feel like direct database views rather than task-focused workflows.

The highest-value improvements are responsive layout repair, simpler mobile navigation, clearer field-worker workflows, and more action-oriented admin screens for data quality and correction.

## Browser Check

The local Vite app was opened at `http://127.0.0.1:5174/`. The public login screen rendered successfully on a desktop viewport and showed no browser console warnings during the smoke check.

The authenticated pages were reviewed primarily from source because the frontend environment currently points at the remote Supabase project. No remote login, test user creation, or data mutation was performed during this review.

## Highest Priority Findings

### 1. Login Is Desktop-Only In Practice

The login page uses inline fixed two-column styling. It looks acceptable on desktop, but there is no mobile stacking rule. On phones, the hero and form are likely to compress horizontally instead of becoming a simple vertical login flow.

Recommended fix:

- Move login styling into CSS.
- Stack the login hero and form on narrow screens.
- Keep the form width fluid with a safe maximum.
- Fix the mojibake password placeholder.

### 2. Mobile Navigation Is Overloaded

The sidebar becomes a bottom navigation bar on mobile. This is good in principle, but the current route set is too large for a bottom nav, especially for administrators.

Recommended fix:

- Limit mobile bottom navigation to primary field/office actions.
- Keep admin-only destinations available from desktop/sidebar views or from a compact admin menu.
- Hide labels on very small screens while preserving accessible names.

Suggested mobile primary routes:

- Dashboard
- My Work
- Map
- Visits
- Practitioners

### 3. Some Page Shells Bypass Shared Responsive Layout

`My Work` and `Data Quality` use custom wrappers rather than the shared `.page` shell. The shared mobile sidebar behavior targets `.page`, so these pages may not reserve space correctly for the bottom navigation bar.

Recommended fix:

- Use the shared `.page` container for new feature pages.
- Add consistent mobile overflow and padding rules.
- Avoid per-page `margin-left` values that drift from the sidebar width.

### 4. Practitioner Mobile CSS Appears Mismatched

The practitioner CSS contains mobile rules for `.p2-list-row`, while the component renders `.p2-row`. This means the intended mobile card layout may not apply.

Recommended fix:

- Align CSS selectors with rendered class names.
- Verify the practitioner list at phone width.
- Keep filter controls usable on mobile.

### 5. Visits List Layout Is Fragile

The visits page has repeated mobile rules for `.ov-row`, and the header/row column definitions appear inconsistent. This can make the visits log difficult to scan, especially on smaller screens.

Recommended fix:

- Normalize the desktop grid columns.
- Convert visit rows to compact cards on mobile.
- Prioritize practitioner, date, type, status, and key metrics.

### 6. Field Staff Need A More Task-Oriented View

The My Work page is a strong start, but it should become the field-worker home screen rather than a thin list.

Recommended improvements:

- Show today and this week first.
- Show ECDC/practitioner names, contact/location cues, last visit, and expected task.
- Highlight submissions that need admin review.
- Add a simple way to flag incorrect data without directly editing sensitive records.

### 7. Admin Pages Need Clearer Workflows

Admin users need fast answers about data quality and cleanup. Current pages expose useful data, but important actions are still scattered.

Recommended improvements:

- Data Quality should become the correction queue.
- Kobo Monitor should guide reprocessing and warnings.
- Deleted Records should prioritize restore and make hard delete secondary.
- Staff Management should use invite/deactivate/reactivate patterns instead of direct raw inserts/deletes.

### 8. Feedback Patterns Are Inconsistent

Several interactions still use `alert()`. This interrupts flow and gives staff little context about what to do next.

Recommended fix:

- Replace alerts with toast or inline status components.
- Use confirmation dialogs for destructive or sensitive actions.
- Keep error text plain and actionable.

## Implementation Priorities

### Critical

- Make login responsive and fix visible mojibake.
- Simplify mobile bottom navigation.
- Make new pages use the shared app shell.
- Repair practitioner mobile list selectors.

### High

- Normalize visits row layout and mobile card behavior.
- Improve My Work with clearer field-worker task summaries.
- Add source/provenance badges to visit-focused screens.

### Medium

- Replace alert usage with consistent feedback.
- Improve dashboard cards with click-through filters.
- Add audit filtering by user, table, date, and record.

### Low

- Reduce inline styles over time.
- Clean up encoded comments and non-visible mojibake.
- Consolidate repeated page shell CSS.

## Suggested Path Forward

Start with responsive layout and navigation fixes because they improve every workflow without changing data behavior. Then make My Work and Data Quality more task-focused. After that, move through page-level improvements for Visits, Practitioners, Staff Management, and Audit.

