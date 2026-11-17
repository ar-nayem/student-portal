export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser } from '@/src/lib/session'
import { orgWhere } from '@/src/lib/orgScope'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getEffectiveUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const result = await prisma.message.updateMany({
      where: { id, receiverId: user.id, ...orgWhere(user) },
      data: { isRead: true },
    })
    if (result.count === 0) return NextResponse.json({ error: 'Message not found' }, { status: 404 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 })
  }
}
