export const dynamic = 'force-dynamic'

import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { orgWhere } from '@/src/lib/orgScope'
import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser, isAdminRole } from '@/src/lib/session'
import { canAccessStudent } from '@/src/lib/studentAssignment'

const stages = new Set(['APPLIED', 'PRE_ADMISSION', 'ADMITTED', 'JW_RECEIVED', 'DOCUMENTS_REQUIRED', 'REJECTED', 'WITHDRAWN', 'OTHER'])

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return null
  if (value === null) return null
  if (typeof value !== 'string' || value.length > max) return undefined
  return value.trim() || null
}

function parseApplication(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const value = body as Record<string, unknown>
  const universityName = typeof value.universityName === 'string' ? value.universityName.trim() : ''
  const universityId = value.universityId === null || value.universityId === '' ? null : value.universityId
  const program = optionalText(value.program, 200)
  const intake = optionalText(value.intake, 100)
  const note = optionalText(value.note, 5000)
  const customStageLabel = optionalText(value.customStageLabel, 100)
  if (!universityName || universityName.length > 200 || (universityId !== null && (typeof universityId !== 'string' || !universityId.trim())) ||
      program === undefined || intake === undefined || note === undefined || customStageLabel === undefined ||
      typeof value.stage !== 'string' || !stages.has(value.stage)) return null
  if (value.stage === 'OTHER' && !customStageLabel) return null
  return { universityName, universityId: universityId as string | null, program, intake, note, stage: value.stage, customStageLabel }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getEffectiveUser(_req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!user.organizationId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await params
    const student = await prisma.student.findFirst({
      where: { id, ...orgWhere(user) },
      select: { id: true, agentId: true },
    })
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    if (!canAccessStudent(user, student)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const applications = await prisma.studentApplication.findMany({
      where: { studentId: id, organizationId: user.organizationId },
      include: {
        history: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: { actor: { select: { id: true, name: true } } },
        },
        university: { select: { id: true, name: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    })
    return NextResponse.json(applications)
  } catch (error) {
    console.error('Failed to fetch student applications:', error)
    return NextResponse.json({ error: 'Failed to fetch applications' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getEffectiveUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isAdminRole(user.role) || !user.organizationId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => null)
    const input = parseApplication(body)
    if (!input) return NextResponse.json({ error: 'Invalid application details' }, { status: 400 })
    const { id } = await params
    const orgId = user.organizationId

    const application = await prisma.$transaction(async tx => {
      const student = await tx.student.findFirst({
        where: { id, organizationId: orgId },
        select: { id: true, status: true, reviewHistory: { select: { id: true }, take: 1 } },
      })
      if (!student) return { kind: 'missing' as const }
      if (student.status === 'PENDING' && student.reviewHistory.length === 0) return { kind: 'pending' as const }

      let university = null
      if (input.universityId) {
        university = await tx.university.findFirst({
          where: { id: input.universityId, organizationId: orgId },
          select: { id: true, name: true },
        })
        if (!university) return { kind: 'university' as const }
      }

      const universityName = university?.name ?? input.universityName
      const created = await tx.studentApplication.create({
        data: {
          studentId: id,
          organizationId: orgId,
          universityId: university?.id ?? null,
          universityName,
          program: input.program,
          intake: input.intake,
          stage: input.stage,
          customStageLabel: input.stage === 'OTHER' ? input.customStageLabel : null,
          notes: input.note,
          createdById: user.id,
          updatedById: user.id,
          history: { create: { fromStage: null, toStage: input.stage, fromCustomStageLabel: null, toCustomStageLabel: input.stage === 'OTHER' ? input.customStageLabel : null, note: input.note, actorId: user.id } },
        },
        include: {
          history: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { actor: { select: { id: true, name: true } } } },
          university: { select: { id: true, name: true } },
        },
      })
      return { kind: 'created' as const, application: created }
    })

    if (application.kind === 'missing') return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    if (application.kind === 'pending') return NextResponse.json({ error: 'Applications can be added after the initial review decision' }, { status: 409 })
    if (application.kind === 'university') return NextResponse.json({ error: 'University not found in this organization' }, { status: 400 })
    return NextResponse.json(application.application, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return NextResponse.json({ error: 'Invalid application reference' }, { status: 400 })
    }
    console.error('Failed to create student application:', error)
    return NextResponse.json({ error: 'Failed to create application' }, { status: 500 })
  }
}
