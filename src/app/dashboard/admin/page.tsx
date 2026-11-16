import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/src/lib/auth'
import { prisma } from '@/src/lib/prisma'
import AdminDashboard from './AdminDashboard'

export default async function AdminPage() {
  const session = await getServerSession(authConfig) as any

  if (!session?.user) redirect('/login')
  if (session.user.role !== 'ADMIN' && session.user.role !== 'OWNER') redirect('/dashboard')

  // session.user.organizationId is already the *active* org (the impersonated
  // one, if a SUPER_DEVELOPER is impersonating — see auth.ts's session
  // callback), so this is safe as-is. A bare SUPER_DEVELOPER never reaches
  // this page (their role is 'SUPER_DEVELOPER', not 'ADMIN'/'OWNER', unless
  // impersonating, in which case organizationId is the impersonated org's).
  const organizationId = session.user.organizationId as string | null
  if (!organizationId) redirect('/login')

  const [agentsCount, studentsCount, pendingCount, recentStudents] = await Promise.all([
    prisma.user.count({ where: { role: 'AGENT', organizationId } }),
    prisma.student.count({ where: { organizationId } }),
    prisma.student.count({ where: { organizationId, status: 'PENDING' } }),
    prisma.student.findMany({
      where: { organizationId },
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        agent: { select: { name: true } },
        documents: true
      }
    })
  ])

  const approvedCount = await prisma.student.count({ where: { organizationId, status: 'APPROVED' } })
  const rejectedCount = await prisma.student.count({ where: { organizationId, status: 'REJECTED' } })

  let canExportBackup = session.user.role === 'OWNER'
  if (!canExportBackup) {
    const dbUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { canExportBackup: true } })
    canExportBackup = !!dbUser?.canExportBackup
  }

  return (
    <AdminDashboard
      stats={{
        agents: agentsCount,
        students: studentsCount,
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount
      }}
      recentStudents={recentStudents}
      canExportBackup={canExportBackup}
    />
  )
}
