export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser } from '@/src/lib/session'
import { SUPER_DEVELOPER } from '@/src/lib/roles'
import { logActivity } from '@/src/lib/activity'
import { sendNotification, orgWelcomeTemplate } from '@/src/lib/email'
import { RESOURCE_DIR } from '@/src/lib/sharedResources'
import { NextRequest, NextResponse } from 'next/server'
import { unlink } from 'fs/promises'
import { join, resolve } from 'path'

// Suspend/reactivate (or rename / adjust plan) an organization. Suspension
// takes effect immediately for that org's users via getEffectiveUser's
// per-request status check — no separate propagation step needed.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getEffectiveUser(req)
    if (!user || user.actualRole !== SUPER_DEVELOPER) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const existing = await prisma.organization.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

    const body = await req.json()
    const data: any = {}

    if (body.status !== undefined) {
      if (body.status !== 'ACTIVE' && body.status !== 'SUSPENDED') {
        return NextResponse.json({ error: 'status must be ACTIVE or SUSPENDED' }, { status: 400 })
      }
      data.status = body.status
      data.suspendedAt = body.status === 'SUSPENDED' ? new Date() : null
      data.suspendedReason = body.status === 'SUSPENDED' ? (body.suspendedReason || null) : null
    }
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
    if (typeof body.planTier === 'string') data.planTier = body.planTier
    if ('studentLimit' in body) data.studentLimit = body.studentLimit === null ? null : Number(body.studentLimit)
    if ('packageId' in body) {
      if (body.packageId !== null) {
        const pkg = await prisma.package.findUnique({ where: { id: body.packageId } })
        if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 400 })
      }
      data.packageId = body.packageId
    }
    // null clears the window back to open-ended access rather than expiring
    // the org immediately — "no expiry set" and "expired" must stay distinct.
    if ('accessExpiresAt' in body) {
      if (body.accessExpiresAt === null || body.accessExpiresAt === '') {
        data.accessExpiresAt = null
      } else {
        const when = new Date(body.accessExpiresAt)
        if (Number.isNaN(when.getTime())) {
          return NextResponse.json({ error: 'Invalid accessExpiresAt date' }, { status: 400 })
        }
        data.accessExpiresAt = when
      }
    }
    if (typeof body.isTrial === 'boolean') data.isTrial = body.isTrial
    if ('alertEmail' in body) {
      const raw = typeof body.alertEmail === 'string' ? body.alertEmail.trim() : ''
      if (raw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
        return NextResponse.json({ error: 'alertEmail must be a valid email address' }, { status: 400 })
      }
      data.alertEmail = raw || null
    }

    const org = await prisma.organization.update({ where: { id }, data })

    await logActivity(user.id, 'ORGANIZATION_UPDATED', `${org.name}: ${JSON.stringify(data)}`)

    // Welcome mail on activation — the transition into ACTIVE, not merely
    // being ACTIVE, so re-saving an already-live org doesn't re-send it.
    // welcomeSentAt makes that permanent: a later suspend/reactivate cycle
    // is a restoration, not a new customer, and shouldn't repeat the
    // getting-started email.
    const justActivated = data.status === 'ACTIVE' && existing.status !== 'ACTIVE'
    if (justActivated && !existing.welcomeSentAt) {
      const origin = new URL(req.url).origin
      await prisma.organization.update({ where: { id }, data: { welcomeSentAt: new Date() } })
      sendNotification(
        `${org.name} is active`,
        orgWelcomeTemplate(org.name, org.accessExpiresAt, `${origin}/login`),
        org.id
      ).catch((err) => console.error('Welcome email failed:', err))
    }

    return NextResponse.json(org)
  } catch (error) {
    console.error('PATCH /api/platform/organizations/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 })
  }
}

// Permanently removes an organization and everything belonging to it.
// Irreversible, so the caller must echo back the exact organization name —
// a mis-click on the wrong row can't get this far.
//
// The order below is deliberate. Only Payment cascades from Organization;
// every other relation is a nullable foreign key with no cascade rule, so
// deleting the org first fails on a constraint. Children go before parents,
// and anything referencing a User goes before the users themselves.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getEffectiveUser(req)
    if (!user || user.actualRole !== SUPER_DEVELOPER) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const org = await prisma.organization.findUnique({
      where: { id },
      select: { id: true, name: true, _count: { select: { users: true, students: true } } },
    })
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

    const confirmName = new URL(req.url).searchParams.get('confirmName')
    if (confirmName !== org.name) {
      return NextResponse.json(
        { error: 'Type the organization name exactly to confirm deletion' },
        { status: 400 }
      )
    }

    // Collect the stored filenames before the rows go, so the uploaded files
    // can be reclaimed afterwards rather than being orphaned on disk.
    const [docs, uniDocs, sharedFiles, userIds, studentIds, portalIds, universityIds] = await Promise.all([
      prisma.document.findMany({ where: { organizationId: id }, select: { filename: true } }),
      prisma.universityDocument.findMany({ where: { organizationId: id }, select: { filename: true } }),
      prisma.sharedResource.findMany({ where: { organizationId: id, kind: 'FILE' }, select: { filename: true } }),
      prisma.user.findMany({ where: { organizationId: id }, select: { id: true } }),
      prisma.student.findMany({ where: { organizationId: id }, select: { id: true } }),
      prisma.universityPortal.findMany({ where: { organizationId: id }, select: { id: true } }),
      prisma.university.findMany({ where: { organizationId: id }, select: { id: true } }),
    ])
    const uids = userIds.map((u) => u.id)
    const sids = studentIds.map((s) => s.id)
    const pids = portalIds.map((p) => p.id)
    const uniIds = universityIds.map((u) => u.id)

    await prisma.$transaction(async (tx) => {
      // Rows that point at this org's users or students but are not
      // themselves org-scoped, so a plain organizationId filter would miss them.
      await tx.message.deleteMany({ where: { OR: [{ organizationId: id }, { senderId: { in: uids } }, { receiverId: { in: uids } }, { studentId: { in: sids } }] } })
      await tx.transaction.deleteMany({ where: { OR: [{ organizationId: id }, { agentId: { in: uids } }, { createdById: { in: uids } }, { studentId: { in: sids } }] } })
      await tx.task.deleteMany({ where: { OR: [{ organizationId: id }, { createdById: { in: uids } }, { assignedToId: { in: uids } }] } })
      await tx.document.deleteMany({ where: { OR: [{ organizationId: id }, { uploadedById: { in: uids } }, { studentId: { in: sids } }] } })
      await tx.universityDocument.deleteMany({ where: { OR: [{ organizationId: id }, { uploadedById: { in: uids } }, { universityId: { in: uniIds } }] } })
      await tx.university.deleteMany({ where: { OR: [{ organizationId: id }, { createdById: { in: uids } }] } })
      // Snapshots and change logs cascade from the portal itself.
      await tx.universityPortal.deleteMany({ where: { OR: [{ organizationId: id }, { id: { in: pids } }, { createdById: { in: uids } }] } })
      await tx.offer.deleteMany({ where: { OR: [{ organizationId: id }, { createdById: { in: uids } }] } })
      await tx.student.deleteMany({ where: { OR: [{ organizationId: id }, { agentId: { in: uids } }] } })
      await tx.documentRequirement.deleteMany({ where: { organizationId: id } })
      await tx.fieldRequirement.deleteMany({ where: { organizationId: id } })
      await tx.scanSettings.deleteMany({ where: { organizationId: id } })
      await tx.organizationProfile.deleteMany({ where: { OR: [{ organizationId: id }, { userId: { in: uids } }] } })
      await tx.activityLog.deleteMany({ where: { OR: [{ organizationId: id }, { userId: { in: uids } }] } })
      await tx.payment.deleteMany({ where: { organizationId: id } })
      // VisitorLog.organizationId is a plain column with no foreign key, so
      // these would survive as untraceable rows if not cleared here.
      await tx.visitorLog.deleteMany({ where: { organizationId: id } })
      // Grants and access logs cascade from the resource. This has to precede the
      // user delete: SharedResource.createdById and ResourceGrant.grantedById
      // restrict deleting the users that made them.
      await tx.sharedResource.deleteMany({ where: { organizationId: id } })
      // Self-referencing manager link has to be cleared before the users go.
      await tx.user.updateMany({ where: { managedByAdminId: { in: uids } }, data: { managedByAdminId: null } })
      await tx.user.deleteMany({ where: { organizationId: id } })
      await tx.organization.delete({ where: { id } })
    })

    // Files last: a failure here leaves disk litter, which is recoverable,
    // whereas doing it first could delete files for a transaction that then
    // rolled back.
    const uploadDir = join(process.cwd(), 'public', 'uploads')
    let filesRemoved = 0
    for (const f of [...docs, ...uniDocs]) {
      if (!f.filename) continue
      const target = resolve(uploadDir, f.filename)
      // Never follow a stored name outside the uploads directory.
      if (!target.startsWith(resolve(uploadDir))) continue
      try {
        await unlink(target)
        filesRemoved++
      } catch {
        // Already gone, or never written — not worth failing the delete over.
      }
    }

    for (const f of sharedFiles) {
      if (!f.filename) continue
      const target = resolve(RESOURCE_DIR, f.filename)
      if (!target.startsWith(resolve(RESOURCE_DIR))) continue
      try {
        await unlink(target)
        filesRemoved++
      } catch {
        // Already gone — not worth failing the delete over.
      }
    }

    await logActivity(
      user.id,
      'ORGANIZATION_DELETED',
      `${org.name} (${org._count.users} users, ${org._count.students} students, ${filesRemoved} files)`
    )

    return NextResponse.json({ success: true, filesRemoved })
  } catch (error) {
    console.error('DELETE /api/platform/organizations/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete organization' }, { status: 500 })
  }
}
