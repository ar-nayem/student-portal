export const dynamic = 'force-dynamic'

import { unlink } from 'fs/promises'
import { join } from 'path'
import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser } from '@/src/lib/session'
import { SUPER_DEVELOPER } from '@/src/lib/roles'
import { logActivity } from '@/src/lib/activity'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getEffectiveUser(req)
  if (!user || user.actualRole !== SUPER_DEVELOPER) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const title = typeof body.title === 'string' ? body.title.trim() : undefined
  const description = typeof body.description === 'string' ? body.description.trim() : undefined

  if (title === '') {
    return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
  }

  const resource = await prisma.platformResource.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
    },
  })

  return NextResponse.json(resource)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getEffectiveUser(req)
  if (!user || user.actualRole !== SUPER_DEVELOPER) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const resource = await prisma.platformResource.findUnique({ where: { id } })
  if (!resource) {
    return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
  }

  await prisma.platformResource.delete({ where: { id } })

  if (resource.kind === 'FILE' && resource.filename) {
    try {
      await unlink(join(process.cwd(), 'storage', 'resources', resource.filename))
    } catch {
      // file already gone from disk — the DB row was the source of truth
    }
  }

  await logActivity(user.id, 'RESOURCE_DELETED', resource.title)
  return NextResponse.json({ success: true })
}
