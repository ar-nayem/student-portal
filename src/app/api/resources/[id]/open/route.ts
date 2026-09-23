export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { RESOURCE_DIR, requireResourceAdmin } from '@/src/lib/sharedResources'
import { ADMIN } from '@/src/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { createReadStream } from 'fs'
import { access } from 'fs/promises'
import { join } from 'path'
import { Readable } from 'stream'

function contentDisposition(name: string) {
  const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireResourceAdmin(req)
  if (guard instanceof NextResponse) return guard
  const { user, orgId } = guard

  const { id } = await params

  const grant = await prisma.resourceGrant.findFirst({
    where: {
      resourceId: id,
      adminId: user.id,
      admin: { role: ADMIN, isActive: true },
      resource: { organizationId: orgId },
    },
  })
  if (!grant) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const resource = await prisma.sharedResource.findUnique({ where: { id } })
  if (!resource) {
    return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
  }

  if (resource.kind === 'LINK') {
    let target: URL
    try {
      target = new URL(resource.url as string)
      if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new Error('bad protocol')
    } catch {
      return NextResponse.json({ error: 'Resource unavailable' }, { status: 404 })
    }

    await prisma.resourceAccessLog.create({ data: { resourceId: id, adminId: user.id } })
    return NextResponse.redirect(target)
  }

  if (!resource.filename) {
    return NextResponse.json({ error: 'Resource unavailable' }, { status: 404 })
  }

  const filePath = join(RESOURCE_DIR, resource.filename)
  try {
    await access(filePath)
  } catch {
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
  }

  await prisma.resourceAccessLog.create({ data: { resourceId: id, adminId: user.id } })

  const webStream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream

  return new NextResponse(webStream, {
    headers: {
      'Content-Type': resource.mimeType || 'application/octet-stream',
      'Content-Length': String(resource.size ?? ''),
      'Content-Disposition': contentDisposition(resource.originalName || resource.title),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=0',
    },
  })
}
