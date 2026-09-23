export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { requireResourceOwner } from '@/src/lib/sharedResources'
import { ADMIN } from '@/src/lib/roles'
import { logActivity } from '@/src/lib/activity'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireResourceOwner(req)
    if (guard instanceof NextResponse) return guard
    const { user, orgId } = guard

    const { id } = await params
    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const adminId = body?.adminId
    if (typeof adminId !== 'string' || !adminId) {
      return NextResponse.json({ error: 'adminId is required' }, { status: 400 })
    }

    const [resource, admin] = await Promise.all([
      prisma.sharedResource.findFirst({ where: { id, organizationId: orgId } }),
      prisma.user.findFirst({ where: { id: adminId, role: ADMIN, isActive: true, organizationId: orgId } }),
    ])
    if (!resource) return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
    if (!admin) {
      return NextResponse.json({ error: 'adminId must be an active admin of your company' }, { status: 400 })
    }

    const key = { resourceId_adminId: { resourceId: id, adminId } }
    const existed = !!(await prisma.resourceGrant.findUnique({ where: key }))
    const grant = await prisma.resourceGrant.upsert({
      where: key,
      update: {},
      create: { resourceId: id, adminId, grantedById: user.id },
    })

    if (!existed) await logActivity(user.id, 'RESOURCE_GRANTED', `${resource.title} → ${admin.name}`)
    return NextResponse.json(grant, { status: 201 })
  } catch (error) {
    console.error('POST /api/shared-resources/[id]/grants error:', error)
    return NextResponse.json({ error: 'Failed to grant access' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireResourceOwner(req)
    if (guard instanceof NextResponse) return guard
    const { user, orgId } = guard

    const { id } = await params
    const adminId = req.nextUrl.searchParams.get('adminId')
    if (!adminId) {
      return NextResponse.json({ error: 'adminId is required' }, { status: 400 })
    }

    const resource = await prisma.sharedResource.findFirst({ where: { id, organizationId: orgId } })
    if (!resource) return NextResponse.json({ error: 'Resource not found' }, { status: 404 })

    const { count } = await prisma.resourceGrant.deleteMany({ where: { resourceId: id, adminId } })
    if (count > 0) {
      const admin = await prisma.user.findUnique({ where: { id: adminId }, select: { name: true } })
      await logActivity(user.id, 'RESOURCE_REVOKED', `${resource.title} ↛ ${admin?.name ?? adminId}`)
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/shared-resources/[id]/grants error:', error)
    return NextResponse.json({ error: 'Failed to revoke access' }, { status: 500 })
  }
}
