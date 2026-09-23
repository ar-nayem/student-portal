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
