export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser, isAdminRole } from '@/src/lib/session'
import { assignableAgentWhere } from '@/src/lib/studentAssignment'

export async function GET(req: NextRequest) {
  const user = await getEffectiveUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminRole(user.role) || !user.organizationId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const agents = await prisma.user.findMany({
    where: assignableAgentWhere(user.organizationId),
    select: { id: true, name: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  })
  return NextResponse.json(agents)
}
