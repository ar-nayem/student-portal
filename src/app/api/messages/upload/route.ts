export const dynamic = 'force-dynamic'

import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { getEffectiveUser, orgHasFeature } from '@/src/lib/session'
import { NextRequest, NextResponse } from 'next/server'

const MAX_SIZE = 30 * 1024 * 1024
const ZIP_TYPES = ['application/zip', 'application/x-zip-compressed', 'application/x-zip', 'multipart/x-zip']

function identifyUpload(buffer: Buffer): { extension: string; attachmentType: 'IMAGE' | 'VIDEO' | 'PDF' | 'ZIP'; acceptedMime: string[] } | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpg', attachmentType: 'IMAGE', acceptedMime: ['image/jpeg'] }
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: 'png', attachmentType: 'IMAGE', acceptedMime: ['image/png'] }
  }
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))) {
    return { extension: 'gif', attachmentType: 'IMAGE', acceptedMime: ['image/gif'] }
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { extension: 'webp', attachmentType: 'IMAGE', acceptedMime: ['image/webp'] }
  }
  if (buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-') {
    return { extension: 'pdf', attachmentType: 'PDF', acceptedMime: ['application/pdf'] }
  }
  if (buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    return { extension: 'mp4', attachmentType: 'VIDEO', acceptedMime: ['video/mp4', 'video/quicktime', 'video/x-m4v'] }
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return { extension: 'webm', attachmentType: 'VIDEO', acceptedMime: ['video/webm'] }
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    return { extension: 'zip', attachmentType: 'ZIP', acceptedMime: ZIP_TYPES }
  }
  return null
}

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

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const detected = identifyUpload(buffer)
    const isZip = detected?.attachmentType === 'ZIP'
    if (!detected || (!detected.acceptedMime.includes(file.type) && !(isZip && file.name.toLowerCase().endsWith('.zip')))) {
      return NextResponse.json({ error: 'Only valid images, videos, PDFs and zip files are supported' }, { status: 400 })
    }

    const uploadDir = join(process.cwd(), 'public', 'uploads', 'messages')
    await mkdir(uploadDir, { recursive: true })

    const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${detected.extension}`
    await writeFile(join(uploadDir, filename), buffer, { flag: 'wx' })

    return NextResponse.json({
      url: `/uploads/messages/${filename}`,
      name: file.name,
      type: detected.attachmentType,
      size: file.size,
    }, { status: 201 })
  } catch (error) {
    console.error('Message upload error:', error)
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }
}
