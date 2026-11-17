export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { SUPER_DEVELOPER } from '@/src/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/src/lib/session'

// Read the live account without applying the organization access restriction
// so the dashboard can explain an expired or suspended subscription.
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // A platform operator has no org window of their own to report on.
    if (!user.organizationId || user.role === SUPER_DEVELOPER) {
      return NextResponse.json({ state: 'OK', isTrial: false, accessExpiresAt: null, daysLeft: null })
    }

    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { name: true, status: true, accessExpiresAt: true, isTrial: true, suspendedReason: true },
    })
    if (!org) return NextResponse.json({ organizationId: user.organizationId, state: 'MISSING' })

    const expiresAt = org.accessExpiresAt
    const msLeft = expiresAt ? expiresAt.getTime() - Date.now() : null
    const state = org.status === 'SUSPENDED'
      ? 'SUSPENDED'
      : msLeft !== null && msLeft <= 0
        ? 'EXPIRED'
        : 'OK'

    return NextResponse.json({
      organizationId: user.organizationId,
      state,
      organizationName: org.name,
      isTrial: org.isTrial,
      accessExpiresAt: expiresAt,
      suspendedReason: org.status === 'SUSPENDED' ? org.suspendedReason : null,
      // Ceil so the last partial day still reads as "1 day left", not "0".
      daysLeft: msLeft === null ? null : Math.max(0, Math.ceil(msLeft / 86400000)),
    })
  } catch (error) {
    console.error('GET /api/organization/access error:', error)
    return NextResponse.json({ error: 'Failed to check access' }, { status: 500 })
  }
}
