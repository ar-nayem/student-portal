import type { Prisma } from '@prisma/client'

export type ReviewDecision = 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION'

const pendingDecisions: readonly ReviewDecision[] = ['APPROVED', 'REJECTED', 'NEEDS_REVISION']

export function reviewDecisionsFor(status: string): readonly ReviewDecision[] {
  if (status === 'PENDING') return pendingDecisions
  if (status === 'APPROVED') return ['NEEDS_REVISION']
  return []
}

export const reviewHistoryInclude = {
  include: { actor: { select: { name: true } } },
  orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
} satisfies Prisma.StudentReviewHistoryFindManyArgs
