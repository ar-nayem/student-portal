# Task 5 implementation report

Date: 2026-11-17

## Implemented

- Added tenant-scoped student application list/create endpoints and an admin/owner-only update endpoint.
- Agents can read application progress only for students currently assigned to them. Application writes verify the student, organization, and optional catalog university against the authenticated organization; actor and organization IDs come from the session.
- Applications can be created after the student has received an initial review decision. The check permits students returned to `PENDING` after a previous decision, using review history to distinguish that from a never-reviewed student.
- University names are saved as snapshots. Catalog selection requires an organization match; free-text university names are supported. Program, intake, stage, and notes remain independent from document review status.
- Application creation records the initial stage in history. Stage or custom `OTHER` label changes append a history event in the same transaction as the update. Updates require the current `updatedAt` value and report stale changes as conflicts.
- Added the Applications panel to student detail with English and Chinese labels, editable controls for owners/admins, and a read-only current stage, notes, and timeline for assigned agents.

## Checks

- `npx tsc --noEmit --incremental false` passed.
- No automated tests or production changes were made.

## Review status

Independent review is pending. No live database migration or deployment was performed.

## Review follow-up

- Preserved the saved university-name snapshot when an update retains the same catalog link (or omits a catalog change). Selecting a different catalog university refreshes the snapshot; switching to typed text saves the entered name.
