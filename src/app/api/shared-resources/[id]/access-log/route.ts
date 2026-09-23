export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { requireResourceOwner } from '@/src/lib/sharedResources'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireResourceOwner(req)
    if (guard instanceof NextResponse) return guard

    const { id } = await params
    const resource = await prisma.sharedResource.findFirst({
      where: { id, organizationId: guard.orgId },
      select: { id: true },
    })
    if (!resource) return NextResponse.json({ error: 'Resource not found' }, { status: 404 })

    const [logs, grants] = await Promise.all([
      prisma.resourceAccessLog.findMany({
        where: { resourceId: id },
        orderBy: { accessedAt: 'desc' },
        select: { id: true, accessedAt: true, admin: { select: { name: true, email: true } } },
      }),
      prisma.resourceGrant.findMany({
        where: { resourceId: id },
        select: {
          adminId: true, grantedAt: true,
          admin: { select: { name: true, email: true } },
          grantedBy: { select: { name: true } },
        },
      }),
    ])

    return NextResponse.json({ logs, grants })
  } catch (error) {
    console.error('GET /api/shared-resources/[id]/access-log error:', error)
    return NextResponse.json({ error: 'Failed to load access history' }, { status: 500 })
  }
}
