export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { requireResourceOwner } from '@/src/lib/sharedResources'
import { ADMIN } from '@/src/lib/roles'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const guard = await requireResourceOwner(req)
    if (guard instanceof NextResponse) return guard

    const admins = await prisma.user.findMany({
      where: { role: ADMIN, isActive: true, organizationId: guard.orgId },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(admins)
  } catch (error) {
    console.error('GET /api/shared-resources/admins error:', error)
    return NextResponse.json({ error: 'Failed to load admins' }, { status: 500 })
  }
}
