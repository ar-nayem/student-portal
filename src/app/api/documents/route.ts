export const dynamic = 'force-dynamic'

import { mkdir, unlink, writeFile } from 'fs/promises'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { STUDENT_DOCUMENT_DIR, studentDocumentPath } from '@/src/lib/studentDocumentStorage'
import { canAccessStudent } from '@/src/lib/studentAssignment'
import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser, isAdminRole, canManageOfficialDocs } from '@/src/lib/session'
import { isSameOrg, requireOrgId } from '@/src/lib/orgScope'
import { NextRequest, NextResponse } from 'next/server'
import { logActivity } from '@/src/lib/activity'

export async function POST(req: NextRequest) {
  try {
    const user = await getEffectiveUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = requireOrgId(user)
    if (!orgId) {
      return NextResponse.json({ error: 'No active organization context' }, { status: 400 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    const studentId = formData.get('studentId') as string
    const type = formData.get('type') as string
    const category = formData.get('category') as string || 'OTHER'

    if (!file || !studentId || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const student = await prisma.student.findUnique({ where: { id: studentId } })
    if (!student || !isSameOrg(user, student)) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    if (!canAccessStudent(user, student)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const requirement = await prisma.documentRequirement.findFirst({ where: { organizationId: orgId, key: category } })
    if (requirement?.isOfficial && !(await canManageOfficialDocs(user))) {
      return NextResponse.json({ error: 'Only the owner or a permitted admin can upload official documents' }, { status: 403 })
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
        student: { connect: {
          id: studentId,
          organizationId: orgId,
          ...(isAdminRole(user.role) ? {} : { agentId: user.id }),
        } },
        uploadedBy: { connect: { id: user.id } },
        organization: { connect: { id: orgId } },
      },
    }).catch(async error => {
      await unlink(filepath).catch(() => {})
      throw error
    })

    await logActivity(user.id, 'DOCUMENT_UPLOADED', `${file.name} → ${student.fullName}`)

    return NextResponse.json(doc, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }
}
