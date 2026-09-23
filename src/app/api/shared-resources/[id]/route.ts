export const dynamic = 'force-dynamic'

import { unlink } from 'fs/promises'
import { join } from 'path'
import { prisma } from '@/src/lib/prisma'
import { RESOURCE_DIR, requireResourceOwner } from '@/src/lib/sharedResources'
import { logActivity } from '@/src/lib/activity'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireResourceOwner(req)
    if (guard instanceof NextResponse) return guard

    const { id } = await params
    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const title = typeof body?.title === 'string' ? body.title.trim() : undefined
    const description = typeof body?.description === 'string' ? body.description.trim() : undefined

    if (title === '') {
      return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
    }

    const existing = await prisma.sharedResource.findFirst({
      where: { id, organizationId: guard.orgId },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
    }

    const resource = await prisma.sharedResource.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
      },
    })

    return NextResponse.json(resource)
  } catch (error) {
    console.error('PATCH /api/shared-resources/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update resource' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireResourceOwner(req)
    if (guard instanceof NextResponse) return guard

    const { id } = await params
    const resource = await prisma.sharedResource.findFirst({
      where: { id, organizationId: guard.orgId },
    })
    if (!resource) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
    }

    await prisma.sharedResource.delete({ where: { id } })

    if (resource.kind === 'FILE' && resource.filename) {
      try {
        await unlink(join(RESOURCE_DIR, resource.filename))
      } catch {
        // file already gone from disk — the DB row was the source of truth
      }
    }

    await logActivity(guard.user.id, 'RESOURCE_DELETED', resource.title)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/shared-resources/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete resource' }, { status: 500 })
  }
}
