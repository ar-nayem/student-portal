export const dynamic = 'force-dynamic'

import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser, isAdminRole } from '@/src/lib/session'
import { findAssignableAgent, InvalidStudentAgent } from '@/src/lib/studentAssignment'

class StaleStudentAssignment extends Error {}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getEffectiveUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isAdminRole(user.role) || !user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid assignment' }, { status: 400 })
    }

    const { agentId: requested, note: rawNote, expectedAssignmentVersion } = body
    if (requested !== null && (typeof requested !== 'string' || !requested.trim())) {
      return NextResponse.json({ error: 'agentId must be an agent ID or null' }, { status: 400 })
    }
    if (rawNote !== undefined && typeof rawNote !== 'string') {
      return NextResponse.json({ error: 'Assignment note must be text' }, { status: 400 })
    }
    if (!Number.isInteger(expectedAssignmentVersion) || expectedAssignmentVersion < 0 || expectedAssignmentVersion > 2_147_483_647) {
      return NextResponse.json({ error: 'Invalid assignment version' }, { status: 400 })
    }

    const agentId: string | null = requested === null ? null : requested.trim()
    const note = rawNote?.trim() || null
    const { id } = await params
    const organizationId = user.organizationId
    const where = { id, organizationId }
    const select = { id: true, agentId: true, assignmentVersion: true, updatedAt: true } satisfies Prisma.StudentSelect

    const student = await prisma.$transaction(async tx => {
      const current = await tx.student.findUnique({ where, select })
      if (!current) return null
      if (current.assignmentVersion !== expectedAssignmentVersion) throw new StaleStudentAssignment()
      if (agentId !== null && !(await findAssignableAgent(tx, organizationId, agentId))) {
        throw new InvalidStudentAgent()
      }
      if (agentId === current.agentId) return current

      const changedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1))

      return tx.student.update({
        where: { ...where, assignmentVersion: expectedAssignmentVersion, updatedAt: current.updatedAt },
        data: {
          agentId,
          assignmentVersion: { increment: 1 },
          updatedAt: changedAt,
          assignmentHistory: { create: { fromAgentId: current.agentId, toAgentId: agentId, actorId: user.id, note, createdAt: changedAt } },
        },
        select,
      })
    })

    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    return NextResponse.json(student)
  } catch (error) {
    if (error instanceof InvalidStudentAgent) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof StaleStudentAssignment ||
      (error instanceof Prisma.PrismaClientKnownRequestError && ['P1008', 'P2025', 'P2034'].includes(error.code))) {
      return NextResponse.json({ error: 'The student changed. Reload and try again.' }, { status: 409 })
    }
    console.error('Failed to assign student:', error)
    return NextResponse.json({ error: 'Failed to assign student' }, { status: 500 })
  }
}
