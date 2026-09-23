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
