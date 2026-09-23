export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser } from '@/src/lib/session'
import { SUPER_DEVELOPER, ADMIN } from '@/src/lib/roles'
import { logActivity } from '@/src/lib/activity'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getEffectiveUser(req)
  if (!user || user.actualRole !== SUPER_DEVELOPER) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const adminId = body.adminId as string
  if (!adminId) {
    return NextResponse.json({ error: 'adminId is required' }, { status: 400 })
  }

  const [resource, admin] = await Promise.all([
    prisma.platformResource.findUnique({ where: { id } }),
    prisma.user.findUnique({ where: { id: adminId } }),
  ])
  if (!resource) return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
  if (!admin || admin.role !== ADMIN) {
    return NextResponse.json({ error: 'adminId must be an ADMIN-role user' }, { status: 400 })
  }

  const grant = await prisma.resourceGrant.upsert({
    where: { resourceId_adminId: { resourceId: id, adminId } },
    update: {},
    create: { resourceId: id, adminId, grantedById: user.id },
  })

  await logActivity(user.id, 'RESOURCE_GRANTED', `${resource.title} → ${admin.name}`)
  return NextResponse.json(grant, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getEffectiveUser(req)
  if (!user || user.actualRole !== SUPER_DEVELOPER) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const adminId = req.nextUrl.searchParams.get('adminId')
  if (!adminId) {
    return NextResponse.json({ error: 'adminId is required' }, { status: 400 })
  }

  const [resource, admin] = await Promise.all([
    prisma.platformResource.findUnique({ where: { id } }),
    prisma.user.findUnique({ where: { id: adminId } }),
  ])

  await prisma.resourceGrant.deleteMany({ where: { resourceId: id, adminId } })
  await logActivity(user.id, 'RESOURCE_REVOKED', `${resource?.title ?? id} ↛ ${admin?.name ?? adminId}`)
  return NextResponse.json({ success: true })
}
