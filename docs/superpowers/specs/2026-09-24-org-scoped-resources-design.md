# Shared Resources — per-company control (supersedes the platform-level design)

Date: 2026-09-24. Replaces the "SUPER_DEVELOPER shares across every company" model in
`2026-09-23-platform-resources-design.md`.

## Why

Each company has its own Developer (the OWNER account, shown with the "Developer" badge).
The Developer of a company must control resources for that company's own admins; companies
must not see or reach each other. The single platform operator is no longer the manager.

## Rules

- A resource belongs to exactly one company (`SharedResource.organizationId`, required).
- Only that company's OWNER manages it: create (file or http/https link), edit, delete, grant,
  revoke, and read the access history. A SUPER_DEVELOPER can do the same by impersonating a
  company (impersonation already remaps the role to OWNER and scopes to that company).
- Only ACTIVE `ADMIN` users **of the same company** can be granted. Agents and other companies'
  admins are rejected (400).
- Every id lookup filters on the caller's company; a resource in another company answers 404.
- Admins list and open only resources granted to them, and only while the resource's company
  matches their own company (checked in the grant query, so a forged cross-company grant row
  still cannot open anything).
- Gated per package: feature key `shared_resources` (Administration group). No package =
  unrestricted, so existing companies are unaffected until a tier is assigned. Enforced on
  every owner and admin route and hidden in the sidebar/page.
- The live user row is re-checked (role + `isActive`) because the login token's role is fixed at
  sign-in: a deactivated owner or admin holding a valid token is refused.

## Surface

- Owner API: `/api/shared-resources` (GET, POST), `/[id]` (PATCH, DELETE), `/[id]/grants`
  (POST, DELETE), `/[id]/access-log` (GET), `/admins` (GET, the company's active admins).
- Admin API (unchanged paths): `GET /api/resources`, `GET /api/resources/[id]/open` — the only
  route that serves file bytes or redirects to a link; it logs every successful open.
- One page, `/dashboard/resources`: owners get the management view, admins the list, everyone
  else is redirected. Shared guards and the storage path live in `src/lib/sharedResources.ts`.
- Files are stored in `storage/resources/` (never `public/`). Deleting a resource, or a whole
  company, removes its stored files.

## Migration

Model `PlatformResource` becomes `SharedResource` with a required `organizationId`. The
production tables were empty when this shipped, so `prisma db push` recreates them without data
loss; confirm the counts are still 0 before pushing.
