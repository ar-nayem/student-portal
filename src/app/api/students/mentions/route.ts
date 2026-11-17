export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser, isAdminRole } from '@/src/lib/session'
import type { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'

// Lightweight lookup for @mention autocomplete in messages, and for tagging
// a student onto a university document upload.
// Agents only see their own students; admins/owner see everyone.
export async function GET(req: NextRequest) {
  try {
    const user = await getEffectiveUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!user.organizationId || (!isAdminRole(user.role) && user.role !== 'AGENT')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const q = new URL(req.url).searchParams.get('q')?.trim() || ''

    const where: Prisma.StudentWhereInput = { organizationId: user.organizationId, ...(isAdminRole(user.role) ? {} : { agentId: user.id }) }
    if (q) {
      where.OR = [
        { serialNumber: { contains: q } },
        { fullName: { contains: q } },
        { passportNo: { contains: q } },
      ]
    }

    const students = await prisma.student.findMany({
      where,
      select: { id: true, fullName: true, serialNumber: true, status: true, passportNo: true },
      orderBy: { createdAt: 'desc' },
      take: 8,
    })

    return NextResponse.json(students)
  } catch {
    return NextResponse.json({ error: 'Failed to search students' }, { status: 500 })
  }
}
