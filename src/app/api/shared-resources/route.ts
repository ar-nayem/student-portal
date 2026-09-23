export const dynamic = 'force-dynamic'

import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { prisma } from '@/src/lib/prisma'
import { RESOURCE_DIR, requireResourceOwner } from '@/src/lib/sharedResources'
import { logActivity } from '@/src/lib/activity'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const guard = await requireResourceOwner(req)
    if (guard instanceof NextResponse) return guard

    const resources = await prisma.sharedResource.findMany({
      where: { organizationId: guard.orgId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, title: true, description: true, kind: true,
        originalName: true, mimeType: true, size: true, url: true,
        createdAt: true,
        createdBy: { select: { name: true } },
        _count: { select: { grants: true, accessLogs: true } },
      },
    })

    return NextResponse.json(resources)
  } catch (error) {
    console.error('GET /api/shared-resources error:', error)
    return NextResponse.json({ error: 'Failed to load resources' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireResourceOwner(req)
    if (guard instanceof NextResponse) return guard
    const { user, orgId } = guard

    const formData = await req.formData()
    const kind = formData.get('kind') as string
    const title = ((formData.get('title') as string) || '').trim()
    const description = ((formData.get('description') as string) || '').trim() || null

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }
    if (kind !== 'FILE' && kind !== 'LINK') {
      return NextResponse.json({ error: 'kind must be FILE or LINK' }, { status: 400 })
    }

    if (kind === 'LINK') {
      const url = ((formData.get('url') as string) || '').trim()
      if (!url) {
        return NextResponse.json({ error: 'url is required for a LINK resource' }, { status: 400 })
      }
      let parsed: URL
      try {
        parsed = new URL(url)
      } catch {
        return NextResponse.json({ error: 'url must be a valid http(s) URL' }, { status: 400 })
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return NextResponse.json({ error: 'url must be a valid http(s) URL' }, { status: 400 })
      }
      const resource = await prisma.sharedResource.create({
        data: { title, description, kind, url, createdById: user.id, organizationId: orgId },
      })
      await logActivity(user.id, 'RESOURCE_CREATED', `${title} (link)`)
      return NextResponse.json(resource, { status: 201 })
    }

    const file = formData.get('file') as File
    if (!file) {
      return NextResponse.json({ error: 'file is required for a FILE resource' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await mkdir(RESOURCE_DIR, { recursive: true })

    const rawExt = file.name.split('.').pop() || ''
    const ext = /^[a-zA-Z0-9]{1,10}$/.test(rawExt) ? rawExt : 'bin'
    const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`
    await writeFile(join(RESOURCE_DIR, filename), buffer)

    const resource = await prisma.sharedResource.create({
      data: {
        title, description, kind,
        filename, originalName: file.name, mimeType: file.type, size: file.size,
        createdById: user.id, organizationId: orgId,
      },
    })

    await logActivity(user.id, 'RESOURCE_CREATED', `${title} (file: ${file.name})`)
    return NextResponse.json(resource, { status: 201 })
  } catch (error) {
    console.error('POST /api/shared-resources error:', error)
    return NextResponse.json({ error: 'Failed to create resource' }, { status: 500 })
  }
}
