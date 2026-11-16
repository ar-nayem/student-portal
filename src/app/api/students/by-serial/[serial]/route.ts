export const dynamic = 'force-dynamic'

import { canAccessStudent } from '@/src/lib/studentAssignment'
import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser } from '@/src/lib/session'
import { orgWhere } from '@/src/lib/orgScope'
import { NextRequest, NextResponse } from 'next/server'

// Resolves a @mention like "GL-00004" back to a student id for the message
// renderer. Agents get a 404 for serials they don't own — same response as
// "doesn't exist" so ownership isn't leaked.
export async function GET(req: NextRequest, { params }: { params: Promise<{ serial: string }> }) {
  try {
    const user = await getEffectiveUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { serial } = await params
    // serialNumber is unique per-org, not globally, so findUnique on it alone
    // no longer applies — the org filter is what narrows this to one row.
    const student = await prisma.student.findFirst({
      where: { serialNumber: serial, ...orgWhere(user) },
      select: { id: true, fullName: true, serialNumber: true, status: true, agentId: true },
    })

    if (!student || (!canAccessStudent(user, student))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(student)
  } catch {
    return NextResponse.json({ error: 'Failed to resolve student' }, { status: 500 })
  }
}
