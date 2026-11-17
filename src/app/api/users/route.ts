export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { hash } from 'bcryptjs'
import { getEffectiveUser, orgHasAnyFeature, orgHasFeature } from '@/src/lib/session'
import { orgWhere, requireOrgId } from '@/src/lib/orgScope'
import { NextRequest, NextResponse } from 'next/server'
import { logActivity } from '@/src/lib/activity'
import { AGENT, isOrgAssignableRole } from '@/src/lib/roles'

export async function GET(req: NextRequest) {
  try {
    const user = await getEffectiveUser(req)
    if (!user || (user.role !== 'ADMIN' && user.role !== 'OWNER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await orgHasAnyFeature(user.organizationId, ['manage_accounts', 'alert_settings']))) {
      return NextResponse.json({ error: 'Manage Accounts is not included in your plan' }, { status: 403 })
    }

    const where: any = { role: { not: 'DELETED' }, ...orgWhere(user) }
    if (user.role === 'ADMIN') {
      const managedCount = await prisma.user.count({ where: { managedByAdminId: user.id } })
      // Once the owner has assigned at least one agent to this admin, narrow their
      // roster to just that team. Unassigned admins keep seeing everyone (unchanged default).
      if (managedCount > 0) where.managedByAdminId = user.id
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        managedByAdminId: true,
        managedByAdmin: { select: { id: true, name: true } },
        canViewPortals: true,
        receiveAlerts: true,
        canExportBackup: true,
        canManageOfficialDocuments: true,
        _count: {
          select: { students: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(users)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getEffectiveUser(req)
    if (!user || user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await orgHasFeature(user.organizationId, 'manage_accounts'))) {
      return NextResponse.json({ error: 'Manage Accounts is not included in your plan' }, { status: 403 })
    }

    const orgId = requireOrgId(user)
    if (!orgId) {
      return NextResponse.json({ error: 'No active organization context' }, { status: 400 })
    }

    const body = await req.json()
    const { name, email, password, role = AGENT } = body
    if (!isOrgAssignableRole(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
    }

    const hashed = await hash(password, 12)
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashed,
        role,
        isActive: true,
        organizationId: orgId
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    })

    // Send welcome message from this org's own owner if configured — scoped
    // to the creating user's org, not a global "the owner" lookup, so a new
    // hire at org B never gets a welcome message from org A's owner.
    try {
      const ownerOrg = await prisma.organizationProfile.findFirst({
        where: { organizationId: orgId },
      })
      if (ownerOrg?.welcomeMessage) {
        const owner = await prisma.user.findFirst({ where: { role: 'OWNER', organizationId: orgId } })
        if (owner) {
          await prisma.message.create({
            data: {
              content: ownerOrg.welcomeMessage,
              senderId: owner.id,
              receiverId: newUser.id,
              organizationId: orgId,
            }
          })
        }
      }
    } catch (e) {
      console.error('Failed to send welcome message:', e)
    }

    await logActivity(user.id, 'ACCOUNT_CREATED', `${newUser.name} (${newUser.role})`)

    return NextResponse.json(newUser, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
