export const dynamic = 'force-dynamic'

import { canAccessStudent } from '@/src/lib/studentAssignment'
import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser } from '@/src/lib/session'
import { isSameOrg } from '@/src/lib/orgScope'
import { NextRequest, NextResponse } from 'next/server'
import { open } from 'fs/promises'
import { findStudentDocumentPath } from '@/src/lib/studentDocumentStorage'
import { Readable } from 'stream'

function verifiedPreviewType(mimeType: string, prefix: Buffer) {
  switch (mimeType) {
    case 'image/jpeg':
      return prefix.subarray(0, 3).toString('hex') === 'ffd8ff' ? mimeType : null
    case 'image/png':
      return prefix.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' ? mimeType : null
    case 'image/gif':
      return ['GIF87a', 'GIF89a'].includes(prefix.toString('latin1', 0, 6)) ? mimeType : null
    case 'image/webp':
      return prefix.toString('latin1', 0, 4) === 'RIFF' &&
        prefix.toString('latin1', 8, 12) === 'WEBP' ? mimeType : null
    case 'video/mp4':
      return prefix.toString('latin1', 4, 8) === 'ftyp' &&
        ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V '].includes(prefix.toString('latin1', 8, 12)) ? mimeType : null
    default:
      return null
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getEffectiveUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const doc = await prisma.document.findUnique({
    where: { id },
    include: { student: true }
  })

  if (!doc || !isSameOrg(user, doc) || !isSameOrg(user, doc.student)) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  if (!canAccessStudent(user, doc.student)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const filePath = await findStudentDocumentPath(doc.filename)
  if (!filePath) return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })

  const downloadName = req.nextUrl.searchParams.get('download')
  const file = await open(filePath, 'r')
  try {
    const prefix = Buffer.alloc(12)
    const { bytesRead } = await file.read(prefix, 0, prefix.length, 0)
    const { size } = await file.stat()
    const previewType = verifiedPreviewType(doc.mimeType, prefix.subarray(0, bytesRead))
    const attachmentName = downloadName || doc.originalName
    const encodedName = encodeURIComponent(Buffer.from(attachmentName).toString()).replace(/[!'()*]/g, char =>
      `%${char.charCodeAt(0).toString(16)}`
    )
    const webStream = Readable.toWeb(file.createReadStream({ start: 0 })) as unknown as ReadableStream

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': previewType || 'application/octet-stream',
        'Content-Length': String(size),
        'Content-Disposition': downloadName || !previewType ? `attachment; filename*=UTF-8''${encodedName}` : 'inline',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'",
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    await file.close()
    throw error
  }
}
