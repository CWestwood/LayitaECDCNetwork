# Role Access Matrix

Date: 2026-07-05

This matrix documents the intended access model for the Layita ECDC Network app. It should be used to guide RLS policies, RPC authorization checks, and frontend route visibility.

## Roles

| Role | Primary Users | Intended Scope |
| --- | --- | --- |
| `datacapturer` | Field staff | Own fieldwork, assigned visits, basic practitioner/ECDC lookup, correction requests |
| `manager` | M&E and programme managers | All operational data, correction workflows, data quality queue, reporting |
| `administrator` | System administrators | User management, destructive actions, restores, Kobo reprocessing, system settings |
| `library` | Read-only users | Relevant read-only operational views, no raw payloads or destructive actions |

## Access By Area

| Area | Datacapturer | Manager | Administrator | Library |
| --- | --- | --- | --- | --- |
| Dashboard | Read relevant summary | Read all | Read all | Read relevant summary |
| My Work | Read own planned/recent visits | Read own if staff-linked | Read own if staff-linked | Read own if staff-linked |
| Practitioners/ECDCs | Read needed operational records | Read/update all active records | Read/update all active records | Read only |
| Outreach visits | Create/update own manual visits within limits | Read/update all active visits | Read/update/delete all | Read only |
| Kobo monitor | No | Read status and warnings | Read and reprocess | No |
| Data quality queue | No direct resolution | Resolve unmatched and merge duplicates | Resolve, merge, restore, delete | No |
| Correction requests | Create and read own | Review/resolve all | Review/resolve all | Create/read own if needed |
| Recycle bin | No | No, unless later delegated | Restore and hard delete | No |
| Staff/users | No | No | Manage | No |
| Raw Kobo payloads | No | Restricted, if needed | Yes | No |

## Implementation Notes

- Frontend route hiding is convenience only. RLS and RPC role checks remain the authority.
- `datacapturer` ownership currently depends on matching `profiles.name` to `layita_staff.name`. This should eventually become an explicit foreign key or mapping table.
- Hard delete should remain administrator-only and exceptional. Restore should be the normal recycle-bin action.
- Manager access to merge and unmatched resolution is intentional because data quality cleanup is an M&E workflow, but it should be tested carefully before live rollout.

## Test Priorities

- Anonymous users cannot read operational tables, raw Kobo submissions, or execute sensitive RPCs.
- Datacapturers can see and update only permitted own/manual visit workflows.
- Managers can resolve unmatched records and merge practitioners, but cannot hard delete or manage users.
- Administrators can restore, hard delete, and reprocess.
- Library users remain read-only and cannot access raw Kobo payloads.
