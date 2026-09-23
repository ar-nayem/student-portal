export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { requireResourceAdmin } from '@/src/lib/sharedResources'
import { ADMIN } from '@/src/lib/roles'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const guard = await requireResourceAdmin(req)
  if (guard instanceof NextResponse) return guard
  const { user, orgId } = guard

  const grants = await prisma.resourceGrant.findMany({
    where: {
      adminId: user.id,
      admin: { role: ADMIN, isActive: true },
      resource: { organizationId: orgId },
    },
    orderBy: { grantedAt: 'desc' },
    select: {
      grantedAt: true,
      resource: {
        select: {
          id: true, title: true, description: true, kind: true,
          originalName: true, mimeType: true, size: true,
        },
      },
    },
  })

  return NextResponse.json(grants.map((g) => ({ ...g.resource, grantedAt: g.grantedAt })))
}
