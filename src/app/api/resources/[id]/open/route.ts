export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser } from '@/src/lib/session'
import { ADMIN } from '@/src/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { createReadStream } from 'fs'
import { access } from 'fs/promises'
import { join } from 'path'
import { Readable } from 'stream'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getEffectiveUser(req)
  if (!user || user.role !== ADMIN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const grant = await prisma.resourceGrant.findUnique({
    where: { resourceId_adminId: { resourceId: id, adminId: user.id } },
  })
  if (!grant) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const resource = await prisma.platformResource.findUnique({ where: { id } })
  if (!resource) {
    return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
  }

  await prisma.resourceAccessLog.create({ data: { resourceId: id, adminId: user.id } })

  if (resource.kind === 'LINK') {
    return NextResponse.redirect(resource.url as string)
  }

  const filePath = join(process.cwd(), 'storage', 'resources', resource.filename as string)
  try {
    await access(filePath)
  } catch {
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
  }

  const webStream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream

  return new NextResponse(webStream, {
    headers: {
      'Content-Type': resource.mimeType || 'application/octet-stream',
      'Content-Length': String(resource.size ?? ''),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(resource.originalName || resource.title)}"`,
      'Cache-Control': 'private, max-age=0',
    },
  })
}
