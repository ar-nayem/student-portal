import type { Prisma } from '@prisma/client'

export type ReviewDecision = 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION'

const pendingDecisions: readonly ReviewDecision[] = ['APPROVED', 'REJECTED', 'NEEDS_REVISION']

export function reviewDecisionsFor(status: string): readonly ReviewDecision[] {
  if (status === 'PENDING') return pendingDecisions
  if (status === 'APPROVED') return ['NEEDS_REVISION']
  return []
}

export function parseReviewVersion(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString() === value ? date : null
}

export function nextReviewVersion(previous: Date): Date {
  return new Date(Math.max(Date.now(), previous.getTime() + 1))
}

export const reviewHistoryInclude = {
  include: { actor: { select: { name: true } } },
  orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
} satisfies Prisma.StudentReviewHistoryFindManyArgs
