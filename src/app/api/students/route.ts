export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser, isAdminRole, orgHasFeature } from '@/src/lib/session'
import type { Prisma } from '@prisma/client'
import { requireOrgId } from '@/src/lib/orgScope'
import { NextRequest, NextResponse } from 'next/server'
import { sendNotification, studentSubmissionTemplate } from '@/src/lib/email'
import { logActivity } from '@/src/lib/activity'
import { createStudentFromData } from '@/src/lib/createStudent'
import { adminStudentAssignmentFilter, InvalidStudentAgent, staffAssignedAgent } from '@/src/lib/studentAssignment'

export async function GET(req: NextRequest) {
  try {
    const user = await getEffectiveUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const agentId = searchParams.get('agentId')
    const search = searchParams.get('search')

    if (!user.organizationId || (!isAdminRole(user.role) && user.role !== 'AGENT')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const where: Prisma.StudentWhereInput = {
      organizationId: user.organizationId,
      ...(isAdminRole(user.role) ? await adminStudentAssignmentFilter(user, agentId) : { agentId: user.id }),
    }
    if (status) where.status = status
    if (search) {
      where.AND = [{ OR: [
        { fullName: { contains: search } },
        { givenName: { contains: search } },
        { passportFamilyName: { contains: search } },
        { mainEmail: { contains: search } },
        { passportNo: { contains: search } },
        { serialNumber: { contains: search } }
      ] }]
    }

    const students = await prisma.student.findMany({
      where,
      include: {
        agent: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
        documents: true,
        _count: { select: { documents: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json(students)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getEffectiveUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await orgHasFeature(user.organizationId, 'student_create'))) {
      return NextResponse.json({ error: 'Adding students is not included in your plan' }, { status: 403 })
    }

    const orgId = requireOrgId(user)
    if (!orgId) {
      return NextResponse.json({ error: 'No active organization context' }, { status: 400 })
    }

    if (!isAdminRole(user.role) && user.role !== 'AGENT') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid student data' }, { status: 400 })
    }
    const {
      agentId,
      educationHistory,
      workExperience,
      familyMembers,
      financialSponsors,
      ...studentData
    } = body

    const assignedAgentId = staffAssignedAgent(user, agentId)
    const student = await createStudentFromData(orgId, { creatorId: user.id, assignedAgentId }, studentData, {
      educationHistory, workExperience, familyMembers, financialSponsors,
    })

    await sendNotification(
      'New Student Submission',
      studentSubmissionTemplate(user.name, student.fullName),
      orgId
    )
    await logActivity(user.id, 'STUDENT_CREATED', `${student.fullName} (${student.serialNumber})`)

    return NextResponse.json(student, { status: 201 })
  } catch (error: any) {
    if (error instanceof InvalidStudentAgent) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('POST /api/students error:', error)
    return NextResponse.json({ error: 'Failed to create student', details: error?.message || String(error) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getEffectiveUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isAdminRole(user.role) || !user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { studentIds } = await req.json()
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json({ error: 'No students selected' }, { status: 400 })
    }

    const where: Prisma.StudentWhereInput = {
      id: { in: studentIds },
      organizationId: user.organizationId,
      ...await adminStudentAssignmentFilter(user),
    }

    const toDelete = await prisma.student.findMany({ where, select: { id: true, fullName: true } })
    if (toDelete.length === 0) {
      return NextResponse.json({ error: 'No matching students found' }, { status: 404 })
    }

    await prisma.student.deleteMany({ where: { ...where, id: { in: toDelete.map(s => s.id) } } })
    await logActivity(user.id, 'STUDENT_DELETED', `Batch deleted ${toDelete.length} student(s): ${toDelete.map(s => s.fullName).join(', ')}`)

    return NextResponse.json({ success: true, deletedCount: toDelete.length })
  } catch (error) {
    console.error('DELETE /api/students error:', error)
    return NextResponse.json({ error: 'Failed to delete students' }, { status: 500 })
  }
}
