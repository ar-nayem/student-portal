export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser, isAdminRole } from '@/src/lib/session'
import { orgWhere } from '@/src/lib/orgScope'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { logActivity } from '@/src/lib/activity'
import { reviewHistoryInclude } from '@/src/lib/studentReview'
import { feeFields, optionalTextFields, profileFields, requiredTextFields } from '@/src/lib/studentProfileFields'

const editableFields = new Set<string>([
  ...profileFields,
  'educationHistory', 'workExperience', 'familyMembers', 'financialSponsors',
])

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function replaceEntries<Required extends string, Optional extends string>(
  value: unknown,
  requiredFields: readonly Required[],
  optionalFields: readonly Optional[],
) {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return null

  const create = []
  for (const entry of value) {
    if (!isObject(entry)) return null
    const required = {} as Record<Required, string>
    const optional: Partial<Record<Optional, string | null>> = {}
    for (const field of requiredFields) {
      const text = entry[field]
      if (typeof text !== 'string') return null
      required[field] = text
    }
    for (const field of optionalFields) {
      const text = entry[field]
      if (text === undefined) continue
      if (text !== null && typeof text !== 'string') return null
      optional[field] = text
    }
    create.push({ ...required, ...optional })
  }

  return { deleteMany: {}, create }
}

function studentEdits(body: unknown): Prisma.StudentUpdateInput | null {
  if (!isObject(body) || Object.keys(body).some(field => !editableFields.has(field))) return null

  const data: Prisma.StudentUpdateInput = {}
  for (const field of requiredTextFields) {
    const value = body[field]
    if (value === undefined) continue
    if (typeof value !== 'string') return null
    data[field] = value
  }
  for (const field of optionalTextFields) {
    const value = body[field]
    if (value === undefined) continue
    if (value !== null && typeof value !== 'string') return null
    data[field] = value
  }
  for (const field of feeFields) {
    const value = body[field]
    if (value === undefined) continue
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) return null
    data[field] = value
  }

  const educationHistory = replaceEntries(body.educationHistory, ['degree', 'schoolName', 'yearFrom', 'yearTo'], ['contactPerson'])
  const workExperience = replaceEntries(body.workExperience, ['yearFrom', 'yearTo', 'company', 'occupation'], ['reference', 'phone', 'email'])
  const contactNameFields = ['name', 'relationship', 'nationality'] as const
  const contactDetailFields = ['employer', 'occupation', 'phone', 'email'] as const
  const familyMembers = replaceEntries(body.familyMembers, contactNameFields, contactDetailFields)
  const financialSponsors = replaceEntries(body.financialSponsors, contactNameFields, contactDetailFields)
  if (educationHistory === null || workExperience === null || familyMembers === null || financialSponsors === null) return null

  return { ...data, educationHistory, workExperience, familyMembers, financialSponsors }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getEffectiveUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const student = await prisma.student.findUnique({
      where: { id, ...orgWhere(user) },
      include: {
        agent: { select: { id: true, name: true, email: true } },
        documents: true,
        educationHistory: true,
        workExperience: true,
        familyMembers: true,
        financialSponsors: true,
        reviewHistory: reviewHistoryInclude,
      }
    })

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    if (!isAdminRole(user.role) && (user.role !== 'AGENT' || student.agentId !== user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(student)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch student' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getEffectiveUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const where = { id, ...orgWhere(user) }
    const existing = await prisma.student.findUnique({ where, select: { agentId: true } })
    if (!existing) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    const isAdmin = isAdminRole(user.role)
    if (!isAdmin && (user.role !== 'AGENT' || existing.agentId !== user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const data = studentEdits(await req.json().catch(() => null))
    if (!data) {
      return NextResponse.json({ error: 'Invalid or non-editable student fields' }, { status: 400 })
    }

    const student = await prisma.student.update({
      where: isAdmin ? where : { ...where, agentId: user.id },
      data,
      include: {
        agent: { select: { name: true, email: true } },
        documents: true,
      },
    })

    await logActivity(user.id, 'STUDENT_UPDATED', student.fullName)
    return NextResponse.json(student)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }
    console.error(error)
    return NextResponse.json({ error: 'Failed to update student' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getEffectiveUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const where = { id, ...orgWhere(user) }
    const existing = await prisma.student.findUnique({ where })

    if (!existing) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    const isAdmin = isAdminRole(user.role)
    if (!isAdmin && (user.role !== 'AGENT' || existing.agentId !== user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.student.delete({ where: isAdmin ? where : { ...where, agentId: user.id } })
    await logActivity(user.id, 'STUDENT_DELETED', existing.fullName)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete student' }, { status: 500 })
  }
}
