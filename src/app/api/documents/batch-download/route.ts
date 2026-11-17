export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser, isAdminRole, orgHasFeature } from '@/src/lib/session'
import { orgWhere } from '@/src/lib/orgScope'
import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createReadStream } from 'fs'
import { findStudentDocumentPath } from '@/src/lib/studentDocumentStorage'
import { Readable } from 'stream'

export async function POST(req: NextRequest) {
  try {
    const user = await getEffectiveUser(req)
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await orgHasFeature(user.organizationId, 'document_batch_download'))) {
      return NextResponse.json({ error: 'Batch Document Download is not included in your plan' }, { status: 403 })
    }

    const body = await req.json()
    const { studentIds } = body

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json({ error: 'No students selected' }, { status: 400 })
    }

    const students = await prisma.student.findMany({
      where: { id: { in: studentIds }, ...orgWhere(user) },
      include: { documents: true }
    })

    const requirements = await prisma.documentRequirement.findMany({ where: orgWhere(user) })
    const labelByKey = new Map(requirements.map(r => [r.key, r.label]))
    labelByKey.set('PHOTO', 'Photo')

    const sanitize = (name: string) => name.replace(/[\\/:*?"<>|]/g, '-').trim()

    const zip = new JSZip()

    for (const student of students) {
      const folderName = sanitize(`${student.serialNumber || student.id.slice(0, 8)}-${student.fullName}`)
      const studentFolder = zip.folder(folderName)
      if (!studentFolder) continue

      const usedNames = new Map<string, number>()

      for (const doc of student.documents) {
        const filePath = await findStudentDocumentPath(doc.filename)
        if (!filePath) continue

        const ext = doc.originalName.includes('.') ? doc.originalName.split('.').pop() : ''
        const baseName = sanitize(labelByKey.get(doc.category) || doc.originalName.replace(/\.[^.]+$/, ''))

        const count = usedNames.get(baseName) || 0
        usedNames.set(baseName, count + 1)
        const suffix = count > 0 ? ` (${count + 1})` : ''
        const finalName = ext ? `${baseName}${suffix}.${ext}` : `${baseName}${suffix}`

        // Streamed in rather than read fully into memory up front — this
        // VPS has hit its RAM limit and had the whole app OOM-killed by the
        // kernel when every selected student's files were buffered at once
        // before zipping even started. Streaming keeps peak memory roughly
        // constant regardless of how many/how large the files are.
        studentFolder.file(finalName, createReadStream(filePath))
      }
    }

    const nodeStream = zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'STORE' })
    const webStream = Readable.toWeb(nodeStream as unknown as Readable) as unknown as ReadableStream

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="documents-batch-${Date.now()}.zip"`
      }
    })
  } catch (error) {
    console.error('Batch download error:', error)
    return NextResponse.json({ error: 'Failed to create zip' }, { status: 500 })
  }
}
