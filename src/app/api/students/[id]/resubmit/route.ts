export const dynamic = 'force-dynamic'

import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { logActivity } from '@/src/lib/activity'
import { orgWhere } from '@/src/lib/orgScope'
import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser } from '@/src/lib/session'
import { reviewHistoryInclude } from '@/src/lib/studentReview'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getEffectiveUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.role !== 'AGENT' || !user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.text().then(text => text ? JSON.parse(text) : {}).catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid resubmission' }, { status: 400 })
    }
    if (body.note !== undefined && typeof body.note !== 'string') {
      return NextResponse.json({ error: 'Resubmission note must be text' }, { status: 400 })
    }
    const note = body.note?.trim() || null

    const { id } = await params
    const where = { id, ...orgWhere(user) }
    const existing = await prisma.student.findUnique({
      where,
      select: { agentId: true, status: true, updatedAt: true },
    })
    if (!existing) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    if (existing.agentId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (existing.status !== 'NEEDS_REVISION') {
      return NextResponse.json({ error: 'This student does not have a revision request' }, { status: 409 })
    }

    const student = await prisma.student.update({
      where: { ...where, agentId: user.id, status: existing.status, updatedAt: existing.updatedAt },
      data: {
        status: 'PENDING',
        reviewHistory: { create: { fromStatus: existing.status, toStatus: 'PENDING', note, actorId: user.id } },
      },
      include: { reviewHistory: reviewHistoryInclude },
    })

    await logActivity(user.id, 'STUDENT_STATUS_CHANGED', `${student.fullName}: NEEDS_REVISION → PENDING`)
    return NextResponse.json(student)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'The student changed. Reload and try again.' }, { status: 409 })
    }
    console.error('Failed to resubmit student:', error)
    return NextResponse.json({ error: 'Failed to resubmit student' }, { status: 500 })
  }
}
