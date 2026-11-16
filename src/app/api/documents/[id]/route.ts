export const dynamic = 'force-dynamic'

import { canAccessStudent } from '@/src/lib/studentAssignment'
import { Prisma } from '@prisma/client'
import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser, isAdminRole, canManageOfficialDocs } from '@/src/lib/session'
import { isSameOrg } from '@/src/lib/orgScope'
import { NextRequest, NextResponse } from 'next/server'
import { logActivity } from '@/src/lib/activity'
import { removeStudentDocument } from '@/src/lib/studentDocumentStorage'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
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

    const requirement = await prisma.documentRequirement.findFirst({ where: { organizationId: doc.organizationId, key: doc.category } })
    if (requirement?.isOfficial && !(await canManageOfficialDocs(user))) {
      return NextResponse.json({ error: 'Only the owner or a permitted admin can delete official documents' }, { status: 403 })
    }

    await prisma.document.delete({
      where: {
        id,
        organizationId: doc.organizationId,
        student: { organizationId: doc.student.organizationId, ...(isAdminRole(user.role) ? {} : { agentId: user.id }) },
      },
    })
    try {
      await removeStudentDocument(doc.filename)
    } catch {
      // File may not exist
    }

    await logActivity(user.id, 'DOCUMENT_DELETED', `${doc.originalName} → ${doc.student.fullName}`)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
  }
}
