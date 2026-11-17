export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser, isAdminRole } from '@/src/lib/session'
import { isSameOrg, orgWhere } from '@/src/lib/orgScope'
import { messageStudentSelect, serializeMessageStudent } from '@/src/lib/messageStudent'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getEffectiveUser(req)
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const agent = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        phone: true,
        wechat: true,
        avatar: true,
        bio: true,
        createdAt: true,
        organizationId: true,
      }
    })

    if (!agent || !isSameOrg(user, agent)) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const [students, documentCount, activityLogs, messages] = await Promise.all([
      prisma.student.findMany({
        where: { agentId: id, organizationId: agent.organizationId },
        select: {
          id: true,
          fullName: true,
          serialNumber: true,
          status: true,
          mainEmail: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { documents: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.document.count({ where: { uploadedById: id } }),
      prisma.activityLog.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      prisma.message.findMany({
        where: {
          OR: [
            { senderId: user.id, receiverId: id },
            { senderId: id, receiverId: user.id },
          ],
          ...orgWhere(user),
        },
        include: {
          sender: { select: { id: true, name: true, role: true } },
          student: { select: messageStudentSelect },
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
      }),
    ])

    const stats = students.reduce(
      (acc, s) => {
        acc.total++
        if (s.status === 'PENDING') acc.pending++
        else if (s.status === 'APPROVED') acc.approved++
        else if (s.status === 'REJECTED') acc.rejected++
        return acc
      },
      { total: 0, pending: 0, approved: 0, rejected: 0 }
    )

    return NextResponse.json({
      agent,
      students,
      stats,
      documentCount,
      activityLogs,
      messages: messages.map(message => serializeMessageStudent(user, message)),
    })
  } catch (error) {
    console.error('Agent detail GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch agent' }, { status: 500 })
  }
}
