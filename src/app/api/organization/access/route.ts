export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { getToken } from 'next-auth/jwt'
import { SUPER_DEVELOPER } from '@/src/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuthSecret } from '@/src/lib/authSecret'

const secret = requireAuthSecret()

// Deliberately reads the JWT directly instead of going through
// getEffectiveUser: that helper returns null for a suspended or expired org,
// which is exactly the state this endpoint exists to describe. It has to
// keep answering when everything else has stopped, so the dashboard can show
// "your subscription ended" instead of a wall of failed requests.
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret })
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const role = token.role as string
    const orgId = ((token.impersonatingOrgId as string | null) ?? (token.organizationId as string | null)) || null

    // A platform operator has no org window of their own to report on.
    if (!orgId || role === SUPER_DEVELOPER) {
      return NextResponse.json({ state: 'OK', isTrial: false, accessExpiresAt: null, daysLeft: null })
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, status: true, accessExpiresAt: true, isTrial: true, suspendedReason: true },
    })
    if (!org) return NextResponse.json({ state: 'MISSING' })

    const expiresAt = org.accessExpiresAt
    const msLeft = expiresAt ? expiresAt.getTime() - Date.now() : null
    const state = org.status === 'SUSPENDED'
      ? 'SUSPENDED'
      : msLeft !== null && msLeft <= 0
        ? 'EXPIRED'
        : 'OK'

    return NextResponse.json({
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
