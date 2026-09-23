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
