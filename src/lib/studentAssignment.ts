import type { Prisma } from '@prisma/client'
import { prisma } from '@/src/lib/prisma'
import { AGENT, ADMIN, OWNER } from '@/src/lib/roles'

export const UNASSIGNED_AGENT_FILTER = 'unassigned'

export function assignableAgentWhere(organizationId: string) {
  return { organizationId, role: AGENT, isActive: true }
}

export function findAssignableAgent(tx: Prisma.TransactionClient, organizationId: string, id: string) {
  return tx.user.findFirst({
    where: { id, ...assignableAgentWhere(organizationId) },
    select: { id: true },
  })
}

export class InvalidStudentAgent extends Error {
  constructor() {
    super('Choose an active agent in this organization')
  }
}

export function staffAssignedAgent(user: { id: string; role: string }, requested: unknown) {
  if (user.role === AGENT) return user.id
  if (requested === null || requested === undefined) return null
  if (typeof requested !== 'string' || !requested.trim()) throw new InvalidStudentAgent()
  return requested.trim()
}

export function canAccessStudent(user: { id: string; role: string }, student: { agentId: string | null }) {
  return user.role === OWNER || user.role === ADMIN || (user.role === AGENT && student.agentId === user.id)
}

// Keep the existing managed-agent roster for assigned students while making
// the organization's unassigned queue available to every admin.
export async function adminStudentAssignmentFilter(
  user: { id: string; role: string; organizationId: string | null },
  agentId?: string | null,
): Promise<Prisma.StudentWhereInput> {
  if (agentId === UNASSIGNED_AGENT_FILTER) return { agentId: null }

  if (user.role === ADMIN && user.organizationId) {
    const managed = await prisma.user.findMany({
      where: { managedByAdminId: user.id, organizationId: user.organizationId },
      select: { id: true },
    })
    if (managed.length) {
      const team = [user.id, ...managed.map(agent => agent.id)]
      return agentId
        ? { agentId: { equals: agentId, in: team } }
        : { OR: [{ agentId: { in: team } }, { agentId: null }] }
    }
  }

  return agentId ? { agentId } : {}
}

export const assignmentHistoryInclude = {
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  include: {
    fromAgent: { select: { name: true } },
    toAgent: { select: { name: true } },
    actor: { select: { name: true } },
  },
} satisfies NonNullable<Prisma.StudentInclude['assignmentHistory']>
