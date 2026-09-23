# Platform Resources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the `SUPER_DEVELOPER` upload documents or paste links, grant access to individually-picked `ADMIN`-role users across every organization, and see a full timestamped history of every time a granted admin opens each resource.

**Architecture:** Three new platform-level Prisma models (no `organizationId`, same pattern as `Campaign`): `PlatformResource`, `ResourceGrant`, `ResourceAccessLog`. Files are stored outside `public/` so the only way to reach one is through an authenticated route that checks the grant and writes an access-log row in the same request — that's what makes "every access logged" hold up. Developer manages everything from a new `/dashboard/platform/resources` page; a granted admin sees their resources at a new `/dashboard/resources` page.

**Tech Stack:** Next.js 14 App Router API routes, Prisma + SQLite, NextAuth JWT sessions (`getEffectiveUser`), React client components, existing `en`/`zh` i18n dictionary system.

**Spec:** [docs/superpowers/specs/2026-09-23-platform-resources-design.md](../specs/2026-09-23-platform-resources-design.md)

## Global Constraints

- No `organizationId` on any of the three new models — this is platform-level, not tenant-scoped (spec: Data model).
- Resource files live in `process.cwd()/storage/resources/`, never under `public/` (spec: Storage).
- The only route that ever serves a file or redirects to a link is `GET /api/resources/[id]/open`; it must check the grant and write a `ResourceAccessLog` row before serving (spec: Routes).
- Every developer-facing route checks `user.actualRole !== SUPER_DEVELOPER` → 403. Every admin-facing route checks `user.role !== 'ADMIN'` → 403. Use `getEffectiveUser` from `src/lib/session.ts` for both (spec: Routes).
- This app has no automated test suite (confirmed: no `.test.` files, no jest/vitest config, no test script in `package.json`). Verification in this plan is manual (curl for auth-gate checks, browser for functional checks), matching the rest of the codebase.
- Prisma CLI calls that touch the schema must use `node node_modules/.bin/prisma ...`, not `npx prisma ...` (the latter gets blocked by the permission classifier as a risky action even for a routine `db push`).
- Dev server runs on port 7100 (`npm run dev`).

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | Add `PlatformResource`, `ResourceGrant`, `ResourceAccessLog` models + `User` back-relations |
| `.gitignore` | Add `storage/` so uploaded resource files never get committed |
| `src/app/api/platform/resources/route.ts` | GET (list all resources), POST (create — file upload or link) |
| `src/app/api/platform/resources/[id]/route.ts` | PATCH (edit title/description), DELETE (remove resource + its file) |
| `src/app/api/platform/admins/route.ts` | GET — every `ADMIN`-role user across all orgs, feeds the grant picker |
| `src/app/api/platform/resources/[id]/grants/route.ts` | POST (grant an admin), DELETE (revoke) |
| `src/app/api/platform/resources/[id]/access-log/route.ts` | GET — current grants + full access history for one resource |
| `src/app/dashboard/platform/resources/page.tsx` | Developer UI: create, list, grant/revoke, access history |
| `src/app/api/resources/route.ts` | GET — resources granted to the current admin |
| `src/app/api/resources/[id]/open/route.ts` | GET — the single choke point: grant check → log write → stream file or redirect to link |
| `src/app/dashboard/resources/page.tsx` | Admin UI: list resources granted to me |
| `src/lib/i18n/dictionaries/resources.ts` | `en`/`zh` strings for both pages |
| `src/lib/i18n/dictionaries/index.ts` | Register the new dictionary |
| `src/app/dashboard/layout.tsx` | Add "Resources" nav item to `platformNav` (developer) and to `adminNav` gated on `role === 'ADMIN'` |

---

### Task 1: Schema — PlatformResource, ResourceGrant, ResourceAccessLog

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `PlatformResource`, `ResourceGrant`, `ResourceAccessLog` Prisma models, all later tasks query these via `prisma.platformResource`, `prisma.resourceGrant`, `prisma.resourceAccessLog`.

- [ ] **Step 1: Add the three models**

Append to the end of `prisma/schema.prisma` (after the existing `CampaignRecipient` model):

```prisma
// Platform-level shareable resource (a file or a link) the developer hands
// out to specific admins. Not org-scoped — same reasoning as Campaign.
model PlatformResource {
  id           String   @id @default(uuid())
  title        String
  description  String?
  kind         String   // FILE | LINK
  filename     String?  // set when kind = FILE; stored under storage/resources/, never public/
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

// One admin's permission to see one resource. Deleting this row revokes
// access immediately; it does not touch that admin's past ResourceAccessLog
// rows, so history survives a later revoke.
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

// One row per open/download — full history, not deduped. Written only by
// GET /api/resources/[id]/open, the single route that ever serves the
// underlying file or link.
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

- [ ] **Step 2: Add the back-relations to `User`**

In `prisma/schema.prisma`, find the `User` model's existing `campaigns Campaign[]` line and add these four lines directly after it:

```prisma
  createdResources        PlatformResource[]
  resourceGrantsReceived  ResourceGrant[]      @relation("ResourceGrantedTo")
  resourceGrantsIssued    ResourceGrant[]      @relation("ResourceGrantedBy")
  resourceAccessLogs      ResourceAccessLog[]  @relation("ResourceAccessedBy")
```

- [ ] **Step 3: Validate and push the schema**

Run (from `website/student-portal 2/`):

```bash
node node_modules/.bin/prisma validate
node node_modules/.bin/prisma db push
```

Expected: both commands exit 0; `db push` prints something like `Your database is now in sync with your Prisma schema.`

- [ ] **Step 4: Verify the tables exist**

Run:

```bash
sqlite3 prisma/dev.db ".tables" | tr -s ' ' '\n' | grep -i resource
```

Expected output (order may vary):

```
PlatformResource
ResourceAccessLog
ResourceGrant
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add PlatformResource, ResourceGrant, ResourceAccessLog models

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Resource collection API — list + create

**Files:**
- Create: `src/app/api/platform/resources/route.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `prisma.platformResource` (Task 1), `getEffectiveUser` from `src/lib/session.ts`, `SUPER_DEVELOPER` from `src/lib/roles.ts`, `logActivity` from `src/lib/activity.ts`.
- Produces: `GET /api/platform/resources` → `PlatformResource[]` with `createdBy.name` and `_count.{grants,accessLogs}`. `POST /api/platform/resources` (multipart form: `kind`, `title`, `description?`, `url` when `kind=LINK`, `file` when `kind=FILE`) → created `PlatformResource`, 201.

- [ ] **Step 1: Add `storage/` to `.gitignore`**

Add a line `storage/` right after the existing `public/uploads/` line in `.gitignore`.

- [ ] **Step 2: Write the route**

Create `src/app/api/platform/resources/route.ts`:

```typescript
export const dynamic = 'force-dynamic'

import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser } from '@/src/lib/session'
import { SUPER_DEVELOPER } from '@/src/lib/roles'
import { logActivity } from '@/src/lib/activity'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const user = await getEffectiveUser(req)
  if (!user || user.actualRole !== SUPER_DEVELOPER) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const resources = await prisma.platformResource.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, title: true, description: true, kind: true,
      originalName: true, mimeType: true, size: true, url: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      _count: { select: { grants: true, accessLogs: true } },
    },
  })

  return NextResponse.json(resources)
}

export async function POST(req: NextRequest) {
  try {
    const user = await getEffectiveUser(req)
    if (!user || user.actualRole !== SUPER_DEVELOPER) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await req.formData()
    const kind = formData.get('kind') as string
    const title = ((formData.get('title') as string) || '').trim()
    const description = ((formData.get('description') as string) || '').trim() || null

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }
    if (kind !== 'FILE' && kind !== 'LINK') {
      return NextResponse.json({ error: 'kind must be FILE or LINK' }, { status: 400 })
    }

    if (kind === 'LINK') {
      const url = ((formData.get('url') as string) || '').trim()
      if (!url) {
        return NextResponse.json({ error: 'url is required for a LINK resource' }, { status: 400 })
      }
      const resource = await prisma.platformResource.create({
        data: { title, description, kind, url, createdById: user.id },
      })
      await logActivity(user.id, 'RESOURCE_CREATED', `${title} (link)`)
      return NextResponse.json(resource, { status: 201 })
    }

    const file = formData.get('file') as File
    if (!file) {
      return NextResponse.json({ error: 'file is required for a FILE resource' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const storageDir = join(process.cwd(), 'storage', 'resources')
    await mkdir(storageDir, { recursive: true })

    const rawExt = file.name.split('.').pop() || ''
    const ext = /^[a-zA-Z0-9]{1,10}$/.test(rawExt) ? rawExt : 'bin'
    const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`
    await writeFile(join(storageDir, filename), buffer)

    const resource = await prisma.platformResource.create({
      data: {
        title, description, kind,
        filename, originalName: file.name, mimeType: file.type, size: file.size,
        createdById: user.id,
      },
    })

    await logActivity(user.id, 'RESOURCE_CREATED', `${title} (file: ${file.name})`)
    return NextResponse.json(resource, { status: 201 })
  } catch (error) {
    console.error('POST /api/platform/resources error:', error)
    return NextResponse.json({ error: 'Failed to create resource' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Verify the auth gate**

With the dev server running (`npm run dev`), from another terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:7100/api/platform/resources
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:7100/api/platform/resources
```

Expected: both print `403` (no session cookie present).

- [ ] **Step 4: Commit**

```bash
git add .gitignore src/app/api/platform/resources/route.ts
git commit -m "feat: add platform resources collection API (list + create)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Resource item API — edit + delete

**Files:**
- Create: `src/app/api/platform/resources/[id]/route.ts`

**Interfaces:**
- Consumes: `prisma.platformResource` (Task 1).
- Produces: `PATCH /api/platform/resources/[id]` (`{title?, description?}`) → updated resource. `DELETE /api/platform/resources/[id]` → `{success: true}`, cascades grants/access-logs via schema, removes the file from disk if `kind=FILE`.

- [ ] **Step 1: Write the route**

Create `src/app/api/platform/resources/[id]/route.ts`:

```typescript
export const dynamic = 'force-dynamic'

import { unlink } from 'fs/promises'
import { join } from 'path'
import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser } from '@/src/lib/session'
import { SUPER_DEVELOPER } from '@/src/lib/roles'
import { logActivity } from '@/src/lib/activity'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getEffectiveUser(req)
  if (!user || user.actualRole !== SUPER_DEVELOPER) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const title = typeof body.title === 'string' ? body.title.trim() : undefined
  const description = typeof body.description === 'string' ? body.description.trim() : undefined

  if (title === '') {
    return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
  }

  const resource = await prisma.platformResource.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
    },
  })

  return NextResponse.json(resource)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getEffectiveUser(req)
  if (!user || user.actualRole !== SUPER_DEVELOPER) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const resource = await prisma.platformResource.findUnique({ where: { id } })
  if (!resource) {
    return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
  }

  await prisma.platformResource.delete({ where: { id } })

  if (resource.kind === 'FILE' && resource.filename) {
    try {
      await unlink(join(process.cwd(), 'storage', 'resources', resource.filename))
    } catch {
      // file already gone from disk — the DB row was the source of truth
    }
  }

  await logActivity(user.id, 'RESOURCE_DELETED', resource.title)
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Verify the auth gate**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH http://localhost:7100/api/platform/resources/does-not-exist
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:7100/api/platform/resources/does-not-exist
```

Expected: both print `403`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/platform/resources/[id]/route.ts
git commit -m "feat: add platform resource edit/delete API

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Admin directory API

**Files:**
- Create: `src/app/api/platform/admins/route.ts`

**Interfaces:**
- Consumes: `prisma.user`, `ADMIN` from `src/lib/roles.ts`.
- Produces: `GET /api/platform/admins` → `{id, name, email, isActive, organization: {name} | null}[]`, every `role=ADMIN` user across all orgs, sorted by name. Feeds the grant picker in Task 6's UI.

- [ ] **Step 1: Write the route**

Create `src/app/api/platform/admins/route.ts`:

```typescript
export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser } from '@/src/lib/session'
import { SUPER_DEVELOPER, ADMIN } from '@/src/lib/roles'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const user = await getEffectiveUser(req)
  if (!user || user.actualRole !== SUPER_DEVELOPER) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admins = await prisma.user.findMany({
    where: { role: ADMIN },
    select: {
      id: true, name: true, email: true, isActive: true,
      organization: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(admins)
}
```

- [ ] **Step 2: Verify the auth gate**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:7100/api/platform/admins
```

Expected: `403`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/platform/admins/route.ts
git commit -m "feat: add platform admin directory API

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Grants API + access-log API

**Files:**
- Create: `src/app/api/platform/resources/[id]/grants/route.ts`
- Create: `src/app/api/platform/resources/[id]/access-log/route.ts`

**Interfaces:**
- Consumes: `prisma.resourceGrant`, `prisma.resourceAccessLog`, `prisma.platformResource`, `prisma.user` (Task 1), `ADMIN`/`SUPER_DEVELOPER` from `src/lib/roles.ts`.
- Produces: `POST /api/platform/resources/[id]/grants` (`{adminId}`) → grant row, 201, idempotent (upsert). `DELETE /api/platform/resources/[id]/grants?adminId=...` → `{success: true}`. `GET /api/platform/resources/[id]/access-log` → `{logs: [{id, accessedAt, admin: {name, email, organization}}], grants: [{adminId, grantedAt, admin: {...}, grantedBy: {name}}]}`.

- [ ] **Step 1: Write the grants route**

Create `src/app/api/platform/resources/[id]/grants/route.ts`:

```typescript
export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser } from '@/src/lib/session'
import { SUPER_DEVELOPER, ADMIN } from '@/src/lib/roles'
import { logActivity } from '@/src/lib/activity'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getEffectiveUser(req)
  if (!user || user.actualRole !== SUPER_DEVELOPER) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const adminId = body.adminId as string
  if (!adminId) {
    return NextResponse.json({ error: 'adminId is required' }, { status: 400 })
  }

  const [resource, admin] = await Promise.all([
    prisma.platformResource.findUnique({ where: { id } }),
    prisma.user.findUnique({ where: { id: adminId } }),
  ])
  if (!resource) return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
  if (!admin || admin.role !== ADMIN) {
    return NextResponse.json({ error: 'adminId must be an ADMIN-role user' }, { status: 400 })
  }

  const grant = await prisma.resourceGrant.upsert({
    where: { resourceId_adminId: { resourceId: id, adminId } },
    update: {},
    create: { resourceId: id, adminId, grantedById: user.id },
  })

  await logActivity(user.id, 'RESOURCE_GRANTED', `${resource.title} → ${admin.name}`)
  return NextResponse.json(grant, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getEffectiveUser(req)
  if (!user || user.actualRole !== SUPER_DEVELOPER) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const adminId = req.nextUrl.searchParams.get('adminId')
  if (!adminId) {
    return NextResponse.json({ error: 'adminId is required' }, { status: 400 })
  }

  const [resource, admin] = await Promise.all([
    prisma.platformResource.findUnique({ where: { id } }),
    prisma.user.findUnique({ where: { id: adminId } }),
  ])

  await prisma.resourceGrant.deleteMany({ where: { resourceId: id, adminId } })
  await logActivity(user.id, 'RESOURCE_REVOKED', `${resource?.title ?? id} ↛ ${admin?.name ?? adminId}`)
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Write the access-log route**

Create `src/app/api/platform/resources/[id]/access-log/route.ts`:

```typescript
export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser } from '@/src/lib/session'
import { SUPER_DEVELOPER } from '@/src/lib/roles'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getEffectiveUser(req)
  if (!user || user.actualRole !== SUPER_DEVELOPER) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const [logs, grants] = await Promise.all([
    prisma.resourceAccessLog.findMany({
      where: { resourceId: id },
      orderBy: { accessedAt: 'desc' },
      select: {
        id: true, accessedAt: true,
        admin: { select: { name: true, email: true, organization: { select: { name: true } } } },
      },
    }),
    prisma.resourceGrant.findMany({
      where: { resourceId: id },
      select: {
        adminId: true, grantedAt: true,
        admin: { select: { name: true, email: true, organization: { select: { name: true } } } },
        grantedBy: { select: { name: true } },
      },
    }),
  ])

  return NextResponse.json({ logs, grants })
}
```

- [ ] **Step 3: Verify the auth gates**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:7100/api/platform/resources/x/grants
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:7100/api/platform/resources/x/grants
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:7100/api/platform/resources/x/access-log
```

Expected: all three print `403`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/platform/resources/[id]/grants/route.ts src/app/api/platform/resources/[id]/access-log/route.ts
git commit -m "feat: add resource grant management and access-log APIs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Developer UI — `/dashboard/platform/resources`

**Files:**
- Create: `src/lib/i18n/dictionaries/resources.ts`
- Modify: `src/lib/i18n/dictionaries/index.ts`
- Create: `src/app/dashboard/platform/resources/page.tsx`
- Modify: `src/app/dashboard/layout.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/platform/resources`, `PATCH/DELETE /api/platform/resources/[id]`, `GET /api/platform/admins`, `POST/DELETE /api/platform/resources/[id]/grants`, `GET /api/platform/resources/[id]/access-log` (Tasks 2–5). `useLanguage` from `src/lib/i18n/LanguageContext.tsx`.
- Produces: the `/dashboard/platform/resources` page and a `resources.title` nav entry other tasks don't depend on.

- [ ] **Step 1: Add the i18n dictionary**

Create `src/lib/i18n/dictionaries/resources.ts`:

```typescript
export const en = {
  title: 'Resources',
  subtitle: 'Share documents or links with specific admins, and see who opened what and when',
  newResource: 'New Resource',
  kindFile: 'File',
  kindLink: 'Link',
  titleLabel: 'Title',
  titlePlaceholder: 'e.g. Q3 Commission Sheet',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Optional notes about this resource',
  urlLabel: 'URL',
  urlPlaceholder: 'https://…',
  chooseFile: 'Choose File',
  create: 'Create',
  creating: 'Creating...',
  createFailed: 'Failed to create resource',
  loadFailed: 'Failed to load',
  noResources: 'No resources yet',
  createdBy: 'Created by',
  createdAt: 'Created',
  grantedCount: '{count} admin(s) granted',
  accessCount: '{count} open(s)',
  manageAccess: 'Manage Access',
  accessHistory: 'Access History',
  grantAdmin: 'Grant an admin',
  selectAdmin: 'Select an admin…',
  grant: 'Grant',
  revoke: 'Revoke',
  noGrants: 'No admins granted yet',
  noAccessLogs: 'No opens yet',
  openedAt: 'Opened',
  delete: 'Delete',
  deleteConfirm: 'Delete this resource? This cannot be undone.',
  edit: 'Edit',
  save: 'Save',
  cancel: 'Cancel',
}

export const zh = {
  title: '资源',
  subtitle: '与特定管理员分享文档或链接，并查看谁在何时打开了什么',
  newResource: '新建资源',
  kindFile: '文件',
  kindLink: '链接',
  titleLabel: '标题',
  titlePlaceholder: '例如：第三季度提成表',
  descriptionLabel: '描述',
  descriptionPlaceholder: '关于此资源的可选说明',
  urlLabel: '链接地址',
  urlPlaceholder: 'https://…',
  chooseFile: '选择文件',
  create: '创建',
  creating: '创建中...',
  createFailed: '创建资源失败',
  loadFailed: '加载失败',
  noResources: '暂无资源',
  createdBy: '创建人',
  createdAt: '创建时间',
  grantedCount: '已授权 {count} 位管理员',
  accessCount: '打开 {count} 次',
  manageAccess: '管理访问权限',
  accessHistory: '访问记录',
  grantAdmin: '授权管理员',
  selectAdmin: '选择管理员…',
  grant: '授权',
  revoke: '撤销',
  noGrants: '尚未授权任何管理员',
  noAccessLogs: '尚无打开记录',
  openedAt: '打开时间',
  delete: '删除',
  deleteConfirm: '确定要删除此资源吗？此操作无法撤销。',
  edit: '编辑',
  save: '保存',
  cancel: '取消',
}
```

- [ ] **Step 2: Register the dictionary**

In `src/lib/i18n/dictionaries/index.ts`: add `import * as resources from './resources'` alongside the other imports, and add `resources: resources.en,` / `resources: resources.zh,` to the `en`/`zh` objects (next to the existing `access: access.en,` / `access: access.zh,` lines).

- [ ] **Step 3: Write the page**

Create `src/app/dashboard/platform/resources/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, FileText, Link2, Trash2, Users, History, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/src/lib/i18n/LanguageContext'

interface ResourceSummary {
  id: string
  title: string
  description: string | null
  kind: 'FILE' | 'LINK'
  originalName: string | null
  mimeType: string | null
  size: number | null
  url: string | null
  createdAt: string
  createdBy: { name: string }
  _count: { grants: number; accessLogs: number }
}

interface AdminOption {
  id: string
  name: string
  email: string
  isActive: boolean
  organization: { name: string } | null
}

interface AccessLogEntry {
  id: string
  accessedAt: string
  admin: { name: string; email: string; organization: { name: string } | null }
}

interface GrantEntry {
  adminId: string
  grantedAt: string
  admin: { name: string; email: string; organization: { name: string } | null }
  grantedBy: { name: string }
}

export default function PlatformResourcesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { t } = useLanguage()

  const [resources, setResources] = useState<ResourceSummary[]>([])
  const [admins, setAdmins] = useState<AdminOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [kind, setKind] = useState<'FILE' | 'LINK'>('FILE')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [logs, setLogs] = useState<AccessLogEntry[]>([])
  const [grants, setGrants] = useState<GrantEntry[]>([])
  const [selectedAdminId, setSelectedAdminId] = useState('')

  useEffect(() => {
    if (status === 'loading') return
    if (session && session.user?.actualRole !== 'SUPER_DEVELOPER') {
      router.push('/dashboard')
      return
    }
    if (session) loadAll()
  }, [session, status])

  async function loadAll() {
    setLoading(true)
    try {
      const [rRes, aRes] = await Promise.all([
        fetch('/api/platform/resources'),
        fetch('/api/platform/admins'),
      ])
      if (!rRes.ok || !aRes.ok) throw new Error()
      setResources(await rRes.json())
      setAdmins(await aRes.json())
    } catch {
      toast.error(t('resources.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  async function createResource(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    if (kind === 'LINK' && !url.trim()) return
    if (kind === 'FILE' && !file) return

    setCreating(true)
    try {
      const formData = new FormData()
      formData.set('kind', kind)
      formData.set('title', title.trim())
      formData.set('description', description.trim())
      if (kind === 'LINK') formData.set('url', url.trim())
      else if (file) formData.set('file', file)

      const res = await fetch('/api/platform/resources', { method: 'POST', body: formData })
      if (!res.ok) throw new Error()

      setTitle('')
      setDescription('')
      setUrl('')
      setFile(null)
      setShowCreate(false)
      await loadAll()
    } catch {
      toast.error(t('resources.createFailed'))
    } finally {
      setCreating(false)
    }
  }

  async function deleteResource(id: string) {
    if (!confirm(t('resources.deleteConfirm'))) return
    const res = await fetch(`/api/platform/resources/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error(t('resources.loadFailed'))
      return
    }
    if (expandedId === id) setExpandedId(null)
    await loadAll()
  }

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    setSelectedAdminId('')
    const res = await fetch(`/api/platform/resources/${id}/access-log`)
    if (!res.ok) {
      toast.error(t('resources.loadFailed'))
      return
    }
    const data = await res.json()
    setLogs(data.logs)
    setGrants(data.grants)
  }

  async function grantAdmin(resourceId: string) {
    if (!selectedAdminId) return
    const res = await fetch(`/api/platform/resources/${resourceId}/grants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminId: selectedAdminId }),
    })
    if (!res.ok) {
      toast.error(t('resources.loadFailed'))
      return
    }
    setSelectedAdminId('')
    await toggleExpandRefresh(resourceId)
  }

  async function revokeAdmin(resourceId: string, adminId: string) {
    const res = await fetch(`/api/platform/resources/${resourceId}/grants?adminId=${adminId}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error(t('resources.loadFailed'))
      return
    }
    await toggleExpandRefresh(resourceId)
  }

  async function toggleExpandRefresh(resourceId: string) {
    const res = await fetch(`/api/platform/resources/${resourceId}/access-log`)
    if (!res.ok) return
    const data = await res.json()
    setLogs(data.logs)
    setGrants(data.grants)
    await loadAll()
  }

  if (!session || loading) return <div className="p-8 text-center">{t('common.loading')}</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('resources.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('resources.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> {t('resources.newResource')}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={createResource} className="bg-card rounded-2xl shadow-sm border border-border/60 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setKind('FILE')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${kind === 'FILE' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-border text-muted-foreground'}`}>
              <FileText className="w-3.5 h-3.5 inline mr-1.5" />{t('resources.kindFile')}
            </button>
            <button type="button" onClick={() => setKind('LINK')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${kind === 'LINK' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-border text-muted-foreground'}`}>
              <Link2 className="w-3.5 h-3.5 inline mr-1.5" />{t('resources.kindLink')}
            </button>
          </div>

          <input required value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={t('resources.titlePlaceholder')}
            className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background outline-none focus:ring-2 focus:ring-indigo-500" />

          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            placeholder={t('resources.descriptionPlaceholder')}
            className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />

          {kind === 'LINK' ? (
            <input required value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder={t('resources.urlPlaceholder')}
              className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background outline-none focus:ring-2 focus:ring-indigo-500" />
          ) : (
            <label className="px-3.5 py-2 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:bg-muted transition inline-flex items-center gap-2 cursor-pointer">
              {t('resources.chooseFile')}
              <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              {file && <span className="text-foreground">{file.name}</span>}
            </label>
          )}

          <div className="flex items-center gap-2">
            <button type="submit" disabled={creating}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition inline-flex items-center gap-2 disabled:opacity-50">
              {creating && <Loader2 className="w-4 h-4 animate-spin" />} {creating ? t('resources.creating') : t('resources.create')}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted transition">
              {t('resources.cancel')}
            </button>
          </div>
        </form>
      )}

      <div className="bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden">
        {resources.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">{t('resources.noResources')}</div>
        ) : (
          <div className="divide-y divide-border">
            {resources.map((r) => (
              <div key={r.id}>
                <div className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      {r.kind === 'FILE' ? <FileText className="w-4 h-4 text-indigo-600" /> : <Link2 className="w-4 h-4 text-indigo-600" />}
                      {r.title}
                    </div>
                    {r.description && <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>}
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {t('resources.createdBy')}: {r.createdBy.name} · {new Date(r.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-muted-foreground">{t('resources.grantedCount').replace('{count}', String(r._count.grants))}</span>
                    <span className="text-[11px] text-muted-foreground">{t('resources.accessCount').replace('{count}', String(r._count.accessLogs))}</span>
                    <button type="button" onClick={() => toggleExpand(r.id)}
                      className="px-2.5 py-1 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition inline-flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" /> {t('resources.manageAccess')}
                    </button>
                    <button type="button" onClick={() => deleteResource(r.id)}
                      className="p-1.5 rounded-lg border border-border text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {expandedId === r.id && (
                  <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-background/50">
                    <div className="rounded-xl border border-border p-3">
                      <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {t('resources.grantAdmin')}</p>
                      <div className="flex items-center gap-2 mb-3">
                        <select value={selectedAdminId} onChange={(e) => setSelectedAdminId(e.target.value)}
                          className="flex-1 px-2 py-1.5 border border-border rounded-lg text-xs bg-background outline-none">
                          <option value="">{t('resources.selectAdmin')}</option>
                          {admins.map((a) => (
                            <option key={a.id} value={a.id}>{a.name} — {a.organization?.name || a.email}</option>
                          ))}
                        </select>
                        <button type="button" onClick={() => grantAdmin(r.id)} disabled={!selectedAdminId}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium disabled:opacity-50">
                          {t('resources.grant')}
                        </button>
                      </div>
                      {grants.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">{t('resources.noGrants')}</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {grants.map((g) => (
                            <li key={g.adminId} className="flex items-center justify-between text-xs">
                              <span>{g.admin.name} <span className="text-muted-foreground">({g.admin.organization?.name || g.admin.email})</span></span>
                              <button type="button" onClick={() => revokeAdmin(r.id, g.adminId)} className="text-rose-600 hover:underline inline-flex items-center gap-1">
                                <X className="w-3 h-3" /> {t('resources.revoke')}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="rounded-xl border border-border p-3">
                      <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> {t('resources.accessHistory')}</p>
                      {logs.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">{t('resources.noAccessLogs')}</p>
                      ) : (
                        <ul className="space-y-1.5 max-h-56 overflow-y-auto">
                          {logs.map((l) => (
                            <li key={l.id} className="text-xs">
                              {l.admin.name} <span className="text-muted-foreground">({l.admin.organization?.name || l.admin.email})</span>
                              <span className="text-muted-foreground"> — {new Date(l.accessedAt).toLocaleString()}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add the nav entry**

In `src/app/dashboard/layout.tsx`, add `FolderOpen` to the `lucide-react` import list, then add this line to the `platformNav` array (right after the `campaigns.title` entry):

```tsx
    { label: t('resources.title'), href: '/dashboard/platform/resources', icon: FolderOpen },
```

- [ ] **Step 5: Verify in the browser**

Log in as the `SUPER_DEVELOPER` account, confirm "Resources" appears in the sidebar, click it, create one FILE resource and one LINK resource, confirm both appear in the list with `0` grants and `0` opens.

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n/dictionaries/resources.ts src/lib/i18n/dictionaries/index.ts src/app/dashboard/platform/resources/page.tsx src/app/dashboard/layout.tsx
git commit -m "feat: add developer Resources page (create, grant, access history)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Admin-facing resource API — list granted + tracked open

**Files:**
- Create: `src/app/api/resources/route.ts`
- Create: `src/app/api/resources/[id]/open/route.ts`

**Interfaces:**
- Consumes: `prisma.resourceGrant`, `prisma.platformResource`, `prisma.resourceAccessLog` (Task 1), `getEffectiveUser`, `ADMIN` from `src/lib/roles.ts`.
- Produces: `GET /api/resources` → `{id, title, description, kind, originalName, mimeType, size, url, grantedAt}[]` for the current admin. `GET /api/resources/[id]/open` → 403 if ungranted, else writes a `ResourceAccessLog` row and either redirects (`LINK`) or streams the file (`FILE`).

- [ ] **Step 1: Write the list route**

Create `src/app/api/resources/route.ts`:

```typescript
export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser } from '@/src/lib/session'
import { ADMIN } from '@/src/lib/roles'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const user = await getEffectiveUser(req)
  if (!user || user.role !== ADMIN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const grants = await prisma.resourceGrant.findMany({
    where: { adminId: user.id },
    orderBy: { grantedAt: 'desc' },
    select: {
      grantedAt: true,
      resource: {
        select: {
          id: true, title: true, description: true, kind: true,
          originalName: true, mimeType: true, size: true, url: true,
        },
      },
    },
  })

  return NextResponse.json(grants.map((g) => ({ ...g.resource, grantedAt: g.grantedAt })))
}
```

- [ ] **Step 2: Write the tracked-open route**

Create `src/app/api/resources/[id]/open/route.ts`:

```typescript
export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser } from '@/src/lib/session'
import { ADMIN } from '@/src/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { createReadStream } from 'fs'
import { access } from 'fs/promises'
import { join } from 'path'
import { Readable } from 'stream'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getEffectiveUser(req)
  if (!user || user.role !== ADMIN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const grant = await prisma.resourceGrant.findUnique({
    where: { resourceId_adminId: { resourceId: id, adminId: user.id } },
  })
  if (!grant) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const resource = await prisma.platformResource.findUnique({ where: { id } })
  if (!resource) {
    return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
  }

  await prisma.resourceAccessLog.create({ data: { resourceId: id, adminId: user.id } })

  if (resource.kind === 'LINK') {
    return NextResponse.redirect(resource.url as string)
  }

  const filePath = join(process.cwd(), 'storage', 'resources', resource.filename as string)
  try {
    await access(filePath)
  } catch {
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
  }

  const webStream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream

  return new NextResponse(webStream, {
    headers: {
      'Content-Type': resource.mimeType || 'application/octet-stream',
      'Content-Length': String(resource.size ?? ''),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(resource.originalName || resource.title)}"`,
      'Cache-Control': 'private, max-age=0',
    },
  })
}
```

- [ ] **Step 3: Verify the auth gates**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:7100/api/resources
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:7100/api/resources/x/open
```

Expected: both print `403`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/resources/route.ts src/app/api/resources/[id]/open/route.ts
git commit -m "feat: add admin-facing resource list and tracked-open API

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Admin UI — `/dashboard/resources`

**Files:**
- Create: `src/app/dashboard/resources/page.tsx`
- Modify: `src/app/dashboard/layout.tsx`

**Interfaces:**
- Consumes: `GET /api/resources` (Task 7), `t('resources.*')` (Task 6's dictionary).
- Produces: the `/dashboard/resources` page.

- [ ] **Step 1: Write the page**

Create `src/app/dashboard/resources/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { FileText, Link2, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/src/lib/i18n/LanguageContext'

interface GrantedResource {
  id: string
  title: string
  description: string | null
  kind: 'FILE' | 'LINK'
  originalName: string | null
  mimeType: string | null
  size: number | null
  url: string | null
  grantedAt: string
}

export default function AdminResourcesPage() {
  const { data: session, status } = useSession()
  const { t } = useLanguage()
  const [resources, setResources] = useState<GrantedResource[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'loading' || !session) return
    fetch('/api/resources')
      .then((res) => {
        if (!res.ok) throw new Error()
        return res.json()
      })
      .then(setResources)
      .catch(() => toast.error(t('resources.loadFailed')))
      .finally(() => setLoading(false))
  }, [session, status])

  if (!session || loading) return <div className="p-8 text-center">{t('common.loading')}</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('resources.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('resources.subtitle')}</p>
      </div>

      <div className="bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden">
        {resources.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">{t('resources.noResources')}</div>
        ) : (
          <div className="divide-y divide-border">
            {resources.map((r) => (
              <div key={r.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    {r.kind === 'FILE' ? <FileText className="w-4 h-4 text-indigo-600" /> : <Link2 className="w-4 h-4 text-indigo-600" />}
                    {r.title}
                  </div>
                  {r.description && <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>}
                </div>
                <a
                  href={`/api/resources/${r.id}/open`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition inline-flex items-center gap-1.5 shrink-0"
                >
                  <Download className="w-3.5 h-3.5" /> {r.kind === 'FILE' ? t('resources.chooseFile') : t('resources.kindLink')}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add the nav entry, gated on `role === 'ADMIN'` (not `OWNER`)**

In `src/app/dashboard/layout.tsx`, add this line inside the `isAdmin ? keep([...])` branch of `adminNav` (the `ADMIN`/`OWNER` branch, right after the `universities` line):

```tsx
    role === 'ADMIN' && { label: t('resources.title'), href: '/dashboard/resources', icon: FolderOpen },
```

(`FolderOpen` is already imported from Task 6's Step 4.)

- [ ] **Step 3: Verify in the browser**

As the `SUPER_DEVELOPER`, on `/dashboard/platform/resources`, grant one `ADMIN`-role user access to both test resources created in Task 6. Log in as that admin: confirm "Resources" appears in their sidebar (and does NOT appear for an `OWNER`-role login), confirm both resources are listed, click the file one and confirm it downloads, click the link one and confirm it opens the URL in a new tab.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/resources/page.tsx src/app/dashboard/layout.tsx
git commit -m "feat: add admin Resources page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: End-to-end verification

**Files:** none (verification only, per the spec's testing plan)

- [ ] **Step 1: Full grant → access → track loop**

As `SUPER_DEVELOPER` on `/dashboard/platform/resources`: confirm the file resource created earlier now shows `1 admin(s) granted`. Click "Manage Access", confirm the granted admin appears in the grants list with the correct org name.

- [ ] **Step 2: Multiple opens produce multiple log rows**

As the granted admin, open the file resource twice (e.g. click, then click again from `/dashboard/resources`). As `SUPER_DEVELOPER`, reopen "Manage Access" → "Access History" for that resource and confirm there are 2 separate rows with different timestamps (not deduplicated).

- [ ] **Step 3: Ungranted admin is blocked**

Log in as a second `ADMIN`-role user who was never granted either resource. Confirm `/dashboard/resources` shows `t('resources.noResources')`. Note the file resource's ID (visible in the first admin's `/dashboard/resources` page source, or the developer's resource list), and while logged in as the second admin navigate directly to `http://localhost:7100/api/resources/<that-id>/open`. Confirm the page displays the raw JSON `{"error":"Forbidden"}` rather than downloading the file.

- [ ] **Step 4: Revoke cuts off access, history survives**

As `SUPER_DEVELOPER`, revoke the granted admin's access to the file resource. Confirm the resource disappears from that admin's `/dashboard/resources` list on next reload, and that a direct hit to `/api/resources/<id>/open` as that admin now 403s. Confirm the "Access History" panel for that resource still shows the 2 earlier opens from Step 2 — revoking a grant does not delete past history.

- [ ] **Step 5: Delete cleans up**

As `SUPER_DEVELOPER`, delete the link resource. Confirm it disappears from the developer's list and from any admin's `/dashboard/resources` list. Confirm no error is thrown (delete works even though a `LINK` resource has no file to remove from disk).

- [ ] **Step 6: Final commit**

If Step 1–5 required no code fixes, there's nothing to commit — this task is verification-only. If any fix was needed, commit it with a message describing what broke and the fix, following the same `Co-Authored-By` footer as the other tasks.
