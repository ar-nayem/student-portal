export const dynamic = 'force-dynamic'

import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { orgWhere } from '@/src/lib/orgScope'
import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser, isAdminRole } from '@/src/lib/session'

const stages = new Set(['APPLIED', 'PRE_ADMISSION', 'ADMITTED', 'JW_RECEIVED', 'DOCUMENTS_REQUIRED', 'REJECTED', 'WITHDRAWN', 'OTHER'])
const editable = new Set(['expectedUpdatedAt', 'universityId', 'universityName', 'program', 'intake', 'stage', 'customStageLabel', 'note'])

function nullableText(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string' || value.length > max) return undefined
  return value.trim() || null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; applicationId: string }> }) {
  try {
    const user = await getEffectiveUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isAdminRole(user.role) || !user.organizationId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !editable.has(key))) {
      return NextResponse.json({ error: 'Invalid application details' }, { status: 400 })
    }
    const value = body as Record<string, unknown>
    const updatedAt = typeof value.expectedUpdatedAt === 'string' ? new Date(value.expectedUpdatedAt) : null
    const universityName = nullableText(value.universityName, 200)
    const program = nullableText(value.program, 200)
    const intake = nullableText(value.intake, 100)
    const customStageLabel = nullableText(value.customStageLabel, 100)
    const note = nullableText(value.note, 5000)
    const universityId = value.universityId === undefined ? undefined : (value.universityId === null || value.universityId === '' ? null : value.universityId)

    if (!updatedAt || Number.isNaN(updatedAt.getTime()) ||
        (value.stage !== undefined && (typeof value.stage !== 'string' || !stages.has(value.stage))) ||
        (value.universityName !== undefined && (universityName === undefined || !universityName)) ||
        (value.program !== undefined && program === undefined) || (value.intake !== undefined && intake === undefined) ||
        (value.customStageLabel !== undefined && customStageLabel === undefined) || (value.note !== undefined && note === undefined) ||
        (universityId !== undefined && universityId !== null && (typeof universityId !== 'string' || !universityId.trim()))) {
      return NextResponse.json({ error: 'Invalid application details' }, { status: 400 })
    }

    const { id, applicationId } = await params
    const orgId = user.organizationId
    const result = await prisma.$transaction(async tx => {
      const existing = await tx.studentApplication.findFirst({
        where: { id: applicationId, studentId: id, organizationId: orgId, student: { organizationId: orgId } },
      })
      if (!existing) return { kind: 'missing' as const }
      if (existing.updatedAt.getTime() !== updatedAt.getTime()) return { kind: 'stale' as const }

      let university = null
      if (universityId !== undefined && universityId !== null) {
        university = await tx.university.findFirst({ where: { id: universityId as string, organizationId: orgId }, select: { id: true, name: true } })
        if (!university) return { kind: 'university' as const }
      } else if (universityId === undefined && existing.universityId) {
        university = await tx.university.findFirst({ where: { id: existing.universityId, organizationId: orgId }, select: { id: true, name: true } })
      }

      const nextStage = value.stage as string | undefined ?? existing.stage
      const nextCustomLabel = nextStage === 'OTHER'
        ? (customStageLabel !== undefined ? customStageLabel : existing.customStageLabel)
        : null
      if (nextStage === 'OTHER' && !nextCustomLabel) return { kind: 'label' as const }
      const nextUniversityId = universityId === undefined ? existing.universityId : university?.id ?? null
      const nextUniversityName = university
        ? university.name
        : (universityName ?? existing.universityName)
      const stageChanged = nextStage !== existing.stage || nextCustomLabel !== existing.customStageLabel
      const changedAt = new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1))

      const updated = await tx.studentApplication.update({
        where: { id: applicationId, studentId: id, organizationId: orgId, updatedAt },
        data: {
          universityId: nextUniversityId,
          universityName: nextUniversityName,
          program: program === undefined ? existing.program : program,
          intake: intake === undefined ? existing.intake : intake,
          stage: nextStage,
          customStageLabel: nextCustomLabel,
          notes: note === undefined ? existing.notes : note,
          updatedById: user.id,
          updatedAt: changedAt,
          ...(stageChanged ? {
            history: { create: {
              fromStage: existing.stage,
              toStage: nextStage,
              fromCustomStageLabel: existing.customStageLabel,
              toCustomStageLabel: nextCustomLabel,
              note: note === undefined ? existing.notes : note,
              actorId: user.id,
              createdAt: changedAt,
            } },
          } : {}),
        },
        include: {
          history: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { actor: { select: { id: true, name: true } } } },
          university: { select: { id: true, name: true } },
        },
      })
      return { kind: 'updated' as const, application: updated }
    })

    if (result.kind === 'missing') return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    if (result.kind === 'stale') return NextResponse.json({ error: 'This application changed. Reload and try again.' }, { status: 409 })
    if (result.kind === 'university') return NextResponse.json({ error: 'University not found in this organization' }, { status: 400 })
    if (result.kind === 'label') return NextResponse.json({ error: 'A custom label is required for Other' }, { status: 400 })
    return NextResponse.json(result.application)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2025', 'P2034'].includes(error.code)) {
      return NextResponse.json({ error: 'This application changed. Reload and try again.' }, { status: 409 })
    }
    console.error('Failed to update student application:', error)
    return NextResponse.json({ error: 'Failed to update application' }, { status: 500 })
  }
}
