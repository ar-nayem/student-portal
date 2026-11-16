export const dynamic = 'force-dynamic'

import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { logActivity } from '@/src/lib/activity'
import { sendMail, statusUpdateTemplate } from '@/src/lib/email'
import { orgWhere } from '@/src/lib/orgScope'
import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser, isAdminRole } from '@/src/lib/session'
import { reviewDecisionsFor, reviewHistoryInclude } from '@/src/lib/studentReview'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getEffectiveUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isAdminRole(user.role) || !user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid review decision' }, { status: 400 })
    }

    const { status, note: rawNote } = body
    if (status !== 'APPROVED' && status !== 'REJECTED' && status !== 'NEEDS_REVISION') {
      return NextResponse.json({ error: 'Invalid review status' }, { status: 400 })
    }
    if (rawNote !== undefined && typeof rawNote !== 'string') {
      return NextResponse.json({ error: 'Review note must be text' }, { status: 400 })
    }
    const note = rawNote?.trim() || null
    if (status !== 'APPROVED' && !note) {
      return NextResponse.json({ error: 'A note is required for this decision' }, { status: 400 })
    }

    const { id } = await params
    const where = { id, ...orgWhere(user) }
    const existing = await prisma.student.findUnique({
      where,
      select: { status: true, updatedAt: true },
    })
    if (!existing) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    if (!reviewDecisionsFor(existing.status).includes(status)) {
      return NextResponse.json({ error: 'This decision is unavailable for the current review status' }, { status: 409 })
    }

    // Prisma commits the status and nested history write in the same transaction.
    const student = await prisma.student.update({
      where: { ...where, status: existing.status, updatedAt: existing.updatedAt },
      data: {
        status,
        reviewHistory: { create: { fromStatus: existing.status, toStatus: status, note, actorId: user.id } },
      },
      include: { reviewHistory: reviewHistoryInclude },
    })

    await logActivity(user.id, 'STUDENT_STATUS_CHANGED', `${student.fullName}: ${existing.status} → ${status}`)
    if (student.agentId) {
      try {
        const agent = await prisma.user.findFirst({
          where: {
            id: student.agentId,
            role: 'AGENT',
            organizationId: student.organizationId,
            isActive: true,
            students: { some: where },
          },
          select: { email: true },
        })
        if (agent) {
          const message = statusUpdateTemplate(student.fullName, status, user.name || 'Admin')
          const result = await sendMail(agent.email, message.subject, message.html)
          if (!result.ok && !result.skipped) console.error('Student review notification failed:', result.error)
        }
      } catch (error) {
        console.error('Student review notification failed:', error)
      }
    }

    return NextResponse.json(student)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'The student changed. Reload and try again.' }, { status: 409 })
    }
    console.error('Failed to review student:', error)
    return NextResponse.json({ error: 'Failed to review student' }, { status: 500 })
  }
}
