import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/src/lib/auth'
import { prisma } from '@/src/lib/prisma'
import AgentDashboard from './AgentDashboard'

export default async function AgentPage() {
  const session = await getServerSession(authConfig) as any
  
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'AGENT') redirect('/dashboard')

  if (!session.user.organizationId) redirect('/login')

  const where = { organizationId: session.user.organizationId, agentId: session.user.id }
  const [studentsCount, pendingCount, approvedCount, recentStudents] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.count({ where: { ...where, status: 'PENDING' } }),
    prisma.student.count({ where: { ...where, status: 'APPROVED' } }),
    prisma.student.findMany({
      where,
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { documents: true }
    })
  ])

  return (
    <AgentDashboard
      stats={{
        students: studentsCount,
        pending: pendingCount,
        approved: approvedCount
      }}
      recentStudents={recentStudents}
    />
  )
}
