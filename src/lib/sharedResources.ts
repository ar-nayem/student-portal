import { join } from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser, orgHasFeature, type EffectiveUser } from '@/src/lib/session'
import { ADMIN, OWNER } from '@/src/lib/roles'

export const RESOURCES_FEATURE = 'shared_resources'

// Uploaded files live here, never under public/: the only way to reach one is
// GET /api/resources/[id]/open, which checks the grant and logs the open.
export const RESOURCE_DIR = join(process.cwd(), 'storage', 'resources')

type Guarded = { user: EffectiveUser; orgId: string }

// Guard for every company-side (Developer/owner) route. A SUPER_DEVELOPER
// impersonating a company is remapped to OWNER by getEffectiveUser, so they
// pass through here scoped to that company; un-impersonated they have no
// organizationId and are turned away. The token's role is fixed at login, so
// the live user row is re-read to catch a since-deactivated or demoted owner.
export async function requireResourceOwner(req: NextRequest): Promise<Guarded | NextResponse> {
  const user = await getEffectiveUser(req)
  if (!user || user.role !== OWNER) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!user.organizationId) {
    return NextResponse.json({ error: 'No active organization context' }, { status: 400 })
  }
  const live = await prisma.user.findFirst({
    where: { id: user.id, role: user.actualRole, isActive: true },
    select: { id: true },
  })
  if (!live) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!(await orgHasFeature(user.organizationId, RESOURCES_FEATURE))) {
    return NextResponse.json({ error: 'Shared Resources is not included in your plan' }, { status: 403 })
  }
  return { user, orgId: user.organizationId }
}

// Guard for the admin-facing routes. Every failure is the same bare 403 so a
// caller can't tell "no access" from "no such resource". Whether the admin is
// still an active ADMIN is enforced by the grant query in each route.
export async function requireResourceAdmin(req: NextRequest): Promise<Guarded | NextResponse> {
  const user = await getEffectiveUser(req)
  if (!user || user.role !== ADMIN || !user.organizationId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!(await orgHasFeature(user.organizationId, RESOURCES_FEATURE))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return { user, orgId: user.organizationId }
}
