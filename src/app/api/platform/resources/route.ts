export const dynamic = 'force-dynamic'

import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser } from '@/src/lib/session'
import { SUPER_DEVELOPER } from '@/src/lib/roles'
import { logActivity } from '@/src/lib/activity'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const user = await getEffectiveUser(req)
  if (!user || user.actualRole !== SUPER_DEVELOPER) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const resources = await prisma.platformResource.findMany({
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
}

export async function POST(req: NextRequest) {
  try {
    const user = await getEffectiveUser(req)
    if (!user || user.actualRole !== SUPER_DEVELOPER) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

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
      const resource = await prisma.platformResource.create({
        data: { title, description, kind, url, createdById: user.id },
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
    const storageDir = join(process.cwd(), 'storage', 'resources')
    await mkdir(storageDir, { recursive: true })

    const rawExt = file.name.split('.').pop() || ''
    const ext = /^[a-zA-Z0-9]{1,10}$/.test(rawExt) ? rawExt : 'bin'
    const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`
    await writeFile(join(storageDir, filename), buffer)

    const resource = await prisma.platformResource.create({
      data: {
        title, description, kind,
        filename, originalName: file.name, mimeType: file.type, size: file.size,
        createdById: user.id,
      },
    })

    await logActivity(user.id, 'RESOURCE_CREATED', `${title} (file: ${file.name})`)
    return NextResponse.json(resource, { status: 201 })
  } catch (error) {
    console.error('POST /api/platform/resources error:', error)
    return NextResponse.json({ error: 'Failed to create resource' }, { status: 500 })
  }
}
