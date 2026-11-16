export const dynamic = 'force-dynamic'

import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { getEffectiveUser, orgHasFeature } from '@/src/lib/session'
import { NextRequest, NextResponse } from 'next/server'

const MAX_SIZE = 30 * 1024 * 1024
const ZIP_TYPES = ['application/zip', 'application/x-zip-compressed', 'application/x-zip', 'multipart/x-zip']

export async function POST(req: NextRequest) {
  try {
    const user = await getEffectiveUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await orgHasFeature(user.organizationId, 'messages'))) {
      return NextResponse.json({ error: 'Messages is not included in your plan' }, { status: 403 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large (max 30MB)' }, { status: 400 })
    }

    const isZip = ZIP_TYPES.includes(file.type) || file.name.toLowerCase().endsWith('.zip')

    let attachmentType: 'IMAGE' | 'VIDEO' | 'PDF' | 'ZIP'
    if (file.type.startsWith('image/')) attachmentType = 'IMAGE'
    else if (file.type.startsWith('video/')) attachmentType = 'VIDEO'
    else if (file.type === 'application/pdf') attachmentType = 'PDF'
    else if (isZip) attachmentType = 'ZIP'
    else return NextResponse.json({ error: 'Only images, videos, PDFs and zip files are supported' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'messages')
    await mkdir(uploadDir, { recursive: true })

    const rawExt = file.name.split('.').pop() || ''
    const ext = /^[a-zA-Z0-9]{1,10}$/.test(rawExt) ? rawExt : 'bin'
    const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`
    await writeFile(join(uploadDir, filename), buffer)

    return NextResponse.json({
      url: `/uploads/messages/${filename}`,
      name: file.name,
      type: attachmentType,
      size: file.size,
    }, { status: 201 })
  } catch (error) {
    console.error('Message upload error:', error)
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }
}
