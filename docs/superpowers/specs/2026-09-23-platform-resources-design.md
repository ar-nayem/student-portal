# Platform Resources — permissioned document/link sharing with access tracking

Date: 2026-09-23

## Purpose

The portal developer (`SUPER_DEVELOPER`) needs to hand out documents or
external links to specific `ADMIN`-role users across the deployment
(any organization), and know exactly which admin opened which
resource and when. Today there's no way to share anything outside a
single organization's own `Document`/`UniversityDocument` records, and
no access-tracking exists for anything shared this way.

This is a new, platform-level subsystem — same shape as the existing
`Campaign` feature (not org-scoped, `SUPER_DEVELOPER`-only to manage),
but for shareable resources instead of marketing email.

## Scope

- Developer uploads a file **or** pastes a link, gives it a
  title/description.
- Developer grants access to specific `ADMIN`-role users, picked
  individually (not whole-org, not role-blanket).
- Grants are editable any time (add/remove per admin, independent of
  resource creation).
- Every time a granted admin opens/downloads a resource, a timestamped
  log row is recorded. Full history, not just first-access.
- Admin sees a new "Resources" section in their own dashboard listing
  only what's been granted to them.
- Developer sees, per resource, the full access history (who, when).

**Non-goals** (explicitly deferred, not building now): email
notification on grant, resource categories/search/filtering, a
separate "viewed vs downloaded" distinction in the log, whole-org or
role-blanket grants.

## Data model

Three new Prisma models, no `organizationId` on any of them (platform-
level, same reasoning as `Campaign`):

```prisma
model PlatformResource {
  id           String   @id @default(uuid())
  title        String
  description  String?
  kind         String   // FILE | LINK
  filename     String?  // set when kind = FILE (stored outside public/)
  originalName String?
  mimeType     String?
  size         Int?
  url          String?  // set when kind = LINK
  createdById  String
  createdBy    User     @relation(fields: [createdById], references: [id])
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  grants     ResourceGrant[]
  accessLogs ResourceAccessLog[]
}

model ResourceGrant {
  id          String   @id @default(uuid())
  resourceId  String
  resource    PlatformResource @relation(fields: [resourceId], references: [id], onDelete: Cascade)
  adminId     String
  admin       User     @relation("ResourceGrantedTo", fields: [adminId], references: [id], onDelete: Cascade)
  grantedById String
  grantedBy   User     @relation("ResourceGrantedBy", fields: [grantedById], references: [id])
  grantedAt   DateTime @default(now())

  @@unique([resourceId, adminId])
  @@index([adminId])
}

model ResourceAccessLog {
  id         String   @id @default(uuid())
  resourceId String
  resource   PlatformResource @relation(fields: [resourceId], references: [id], onDelete: Cascade)
  adminId    String
  admin      User     @relation("ResourceAccessedBy", fields: [adminId], references: [id], onDelete: Cascade)
  accessedAt DateTime @default(now())

  @@index([resourceId])
  @@index([adminId])
}
```

`User` needs three new back-relations added (`ResourceGrantedTo`,
`ResourceGrantedBy`, `ResourceAccessedBy`), alongside its existing
`campaigns` relation.

Revoking access means deleting the `ResourceGrant` row — this cuts off
future access immediately, but `ResourceAccessLog` rows are never
deleted alongside it, so history survives a later revoke.

## Storage

Resource files are **not** written under `public/uploads` like
`Document` — that directory is served statically with no auth check,
which would let anyone with the URL bypass the grant system entirely.
Instead: `process.cwd()/storage/resources/`, same random-filename
pattern as the existing upload code
(`${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`).
Link-kind resources have no file at all.

## Routes

**Developer side** (`SUPER_DEVELOPER` only, same gate as
`/dashboard/platform/campaigns`):

- `/dashboard/platform/resources` — list, create, per-resource
  grant/revoke UI, per-resource access-log view
- `GET/POST /api/platform/resources`
- `PATCH/DELETE /api/platform/resources/[id]`
- `GET /api/platform/admins` — every `role=ADMIN` user across all
  orgs, mirrors the existing leads endpoint pattern, feeds the grant
  picker
- `POST/DELETE /api/platform/resources/[id]/grants`
- `GET /api/platform/resources/[id]/access-log` — joined admin name +
  org + timestamp, newest first

**Admin side** (`role=ADMIN` only):

- `/dashboard/resources` — new nav item, visible only when
  `session.user.role === 'ADMIN'`; lists resources currently granted
- `GET /api/resources` — resources joined through
  `ResourceGrant.adminId = user.id`
- `GET /api/resources/[id]/open` — the single choke point for every
  access:
  1. `getEffectiveUser` → must resolve, must be `ADMIN`
  2. verify a `ResourceGrant` row exists for `(resourceId, user.id)` →
     403 if not
  3. write a `ResourceAccessLog` row
  4. `kind=LINK` → redirect to `url`; `kind=FILE` → stream the file
     from the storage dir with `originalName`/`mimeType`

No other route or static path ever serves the file/link — that's what
makes "every access logged" hold up.

## Error handling

Ungranted admin hitting `/api/resources/[id]/open` → 403, same
undifferentiated-failure shape used elsewhere in this app
(`orgAllowsInvite`/`resolveIntakeUser`) — no detail that would tell
someone probing IDs whether the resource exists but they lack access,
vs. doesn't exist. A revoked-mid-session admin simply fails the same
way on their next open attempt (the grant check runs fresh every
request, nothing cached).

## Testing plan

Manual, on the dev server (no automated test suite exists for this
app currently):

1. As `SUPER_DEVELOPER`: create one file resource and one link
   resource, grant admin A only.
2. As admin A: confirm both resources show in `/dashboard/resources`;
   opening the file downloads it and creates a log row; opening the
   link redirects and creates a log row; open the file a second time
   and confirm a second log row appears (full history, not
   dedup'd).
3. As admin B (not granted): confirm empty resource list, and confirm
   a direct `GET /api/resources/[id]/open` hit for A's resource
   returns 403.
4. As `SUPER_DEVELOPER`: revoke admin A's grant, confirm the
   developer's access-log view still shows A's earlier opens; confirm
   admin A immediately loses the resource from their list and 403s on
   direct access.
5. Confirm the access-log view sorts newest-first and shows the
   correct admin name per row when multiple admins have accessed the
   same resource.
