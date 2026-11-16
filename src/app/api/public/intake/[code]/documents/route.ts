export const dynamic = 'force-dynamic'

import { mkdir, unlink, writeFile } from 'fs/promises'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { STUDENT_DOCUMENT_DIR, studentDocumentPath } from '@/src/lib/studentDocumentStorage'
import { prisma } from '@/src/lib/prisma'
import { resolveIntakeUser, verifyIntakeUploadToken } from '@/src/lib/intake'
import { NextRequest, NextResponse } from 'next/server'
import { logActivity } from '@/src/lib/activity'

// Unlike the staff-only /api/documents route, this is a public unauthenticated
// upload surface, so file size is capped hard server-side rather than trusted
// to client-side validation.
const MAX_FILE_SIZE = 15 * 1024 * 1024

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params
    const agent = await resolveIntakeUser(code)
    if (!agent) {
      return NextResponse.json({ error: 'This application link is invalid or no longer active' }, { status: 404 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    const studentId = formData.get('studentId') as string
    const type = formData.get('type') as string
    const category = formData.get('category') as string || 'OTHER'

    if (!file || !studentId || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File exceeds the 15MB upload limit' }, { status: 400 })
    }

    const student = await prisma.student.findUnique({ where: { id: studentId } })
    if (!student || student.organizationId !== agent.organizationId ||
      !verifyIntakeUploadToken(code, student, formData.get('uploadToken'))) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await mkdir(STUDENT_DOCUMENT_DIR, { recursive: true, mode: 0o700 })

    const rawExt = file.name.split('.').pop() || ''
    const ext = /^[a-zA-Z0-9]{1,10}$/.test(rawExt) ? rawExt : 'bin'
    const filename = `${randomUUID()}.${ext}`
    const filepath = studentDocumentPath(filename)
    await writeFile(filepath, buffer, { flag: 'wx', mode: 0o600 })

    let docType: 'PDF' | 'IMAGE' | 'VIDEO' = 'PDF'
    if (type === 'image' || file.type.startsWith('image/')) docType = 'IMAGE'
    else if (type === 'video' || file.type.startsWith('video/')) docType = 'VIDEO'

    const doc = await prisma.document.create({
      data: {
        filename,
        originalName: file.name,
        mimeType: file.type,
        size: file.size,
        type: docType,
        category,
        student: { connect: { id: studentId, organizationId: agent.organizationId, assignmentVersion: student.assignmentVersion } },
        uploadedBy: { connect: { id: agent.id, studentIntakeCode: code, isActive: true, organizationId: agent.organizationId } },
        organization: { connect: { id: agent.organizationId } },
      },
    }).catch(async error => {
      await unlink(filepath).catch(() => {})
      throw error
    })

    await logActivity(agent.id, 'DOCUMENT_UPLOADED', `${file.name} → ${student.fullName}`)

    return NextResponse.json(doc, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }
    console.error('Public intake upload error:', error)
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }
}
