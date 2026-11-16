export const dynamic = 'force-dynamic'

import { Prisma } from '@prisma/client'
import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser, isAdminRole, orgHasAnyFeature, orgHasFeature } from '@/src/lib/session'
import { isSameOrg } from '@/src/lib/orgScope'
import { isOrgAssignableRole, OWNER } from '@/src/lib/roles'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getEffectiveUser(req)
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await orgHasAnyFeature(user.organizationId, ['manage_accounts', 'alert_settings']))) {
      return NextResponse.json({ error: 'Manage Accounts is not included in your plan' }, { status: 403 })
    }

    const { id } = await params
    const targetUser = await prisma.user.findUnique({ where: { id }, select: { organizationId: true, role: true } })
    if (!targetUser || !isSameOrg(user, targetUser)) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    const body = await req.json()

    // Whitelist: never let a raw request body reach prisma.update directly —
    // that would let a `password` field bypass hashing and land in the DB as plaintext.
    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string') data.name = body.name
    if (typeof body.email === 'string') data.email = body.email
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive
    if (body.role !== undefined) {
      if (!isOrgAssignableRole(body.role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
      }
      if (body.role !== targetUser.role) {
        if (id === user.id) {
          return NextResponse.json({ error: 'You cannot change your own role' }, { status: 400 })
        }
        if (targetUser.role === OWNER) {
          return NextResponse.json({ error: 'The organization owner’s role cannot be changed' }, { status: 400 })
        }
        data.role = body.role
      }
    }

    if (typeof body.canViewPortals === 'boolean') {
      if (user.role !== 'OWNER') {
        return NextResponse.json({ error: 'Only the owner can grant University Portals access' }, { status: 403 })
      }
      data.canViewPortals = body.canViewPortals
    }

    if (typeof body.receiveAlerts === 'boolean') {
      if (user.role !== 'OWNER') {
        return NextResponse.json({ error: 'Only the owner can manage alert email recipients' }, { status: 403 })
      }
      data.receiveAlerts = body.receiveAlerts
    }

    if (typeof body.canExportBackup === 'boolean') {
      if (user.role !== 'OWNER') {
        return NextResponse.json({ error: 'Only the owner can grant full-backup export access' }, { status: 403 })
      }
      data.canExportBackup = body.canExportBackup
    }

    if (typeof body.canManageOfficialDocuments === 'boolean') {
      if (user.role !== 'OWNER') {
        return NextResponse.json({ error: 'Only the owner can grant official document access' }, { status: 403 })
      }
      data.canManageOfficialDocuments = body.canManageOfficialDocuments
    }

    if ('managedByAdminId' in body) {
      if (user.role !== 'OWNER') {
        return NextResponse.json({ error: 'Only the owner can assign agents to admins' }, { status: 403 })
      }
      const managedByAdminId = body.managedByAdminId
      if (managedByAdminId === null) {
        data.managedByAdminId = null
      } else if (typeof managedByAdminId === 'string') {
        if (targetUser.role !== 'AGENT') {
          return NextResponse.json({ error: 'Only agent accounts can be assigned to an admin' }, { status: 400 })
        }
        const admin = await prisma.user.findUnique({ where: { id: managedByAdminId }, select: { role: true, organizationId: true } })
        if (!admin || admin.role !== 'ADMIN') {
          return NextResponse.json({ error: 'Can only assign to an admin account' }, { status: 400 })
        }
        // Can't be expressed as a DB constraint (SQLite has no partial/conditional
        // FK) — an admin can only manage agents within their own organization.
        if (admin.organizationId !== targetUser.organizationId) {
          return NextResponse.json({ error: 'Admin and agent must be in the same organization' }, { status: 400 })
        }
        data.managedByAdminId = managedByAdminId
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        managedByAdminId: true,
        canViewPortals: true,
        receiveAlerts: true,
        canExportBackup: true,
        canManageOfficialDocuments: true,
      }
    })
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getEffectiveUser(req)
    if (!user || user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Only the owner can delete accounts' }, { status: 401 })
    }
    if (!(await orgHasFeature(user.organizationId, 'manage_accounts'))) {
      return NextResponse.json({ error: 'Manage Accounts is not included in your plan' }, { status: 403 })
    }

    const { id } = await params

    if (id === user.id) {
      return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 })
    }

    const targetUser = await prisma.user.findUnique({ where: { id }, select: { organizationId: true } })
    if (!targetUser || !isSameOrg(user, targetUser)) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const studentCount = await prisma.student.count({ where: { agentId: id } })
    if (studentCount > 0) {
      return NextResponse.json({
        error: `Cannot delete: ${studentCount} student${studentCount === 1 ? '' : 's'} still assigned to this account. Reassign or delete them first.`
      }, { status: 400 })
    }

    // Anonymize rather than hard-delete: messages and documents this account sent/uploaded
    // stay in the system (shown as "Deleted User"), but the account itself can no longer log in
    // and its personal details are scrubbed. Avoids breaking FK integrity on Message/Document/ActivityLog.
    await prisma.$transaction([
      prisma.organizationProfile.deleteMany({ where: { userId: id } }),
      // Agents managed by a deleted admin fall back to "unassigned" rather than
      // staying silently pinned to a now-anonymized account.
      prisma.user.updateMany({ where: { managedByAdminId: id }, data: { managedByAdminId: null } }),
      prisma.user.update({
        where: { id, organizationId: targetUser.organizationId, students: { none: {} } },
        data: {
          name: 'Deleted User',
          email: `deleted-${id}@deleted.local`,
          password: '',
          role: 'DELETED',
          isActive: false,
          phone: null,
          wechat: null,
          avatar: null,
          bio: null,
        },
      }),
    ])
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'The account changed. Check its student assignments and try again.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
