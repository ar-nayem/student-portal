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

type ReviewHistoryDetails = {
  note: string | null
  correctedDocuments: { id: string; originalName: string | null }[]
}

const legacyCorrectionsPrefix = 'Corrected document IDs\n'

export function readReviewHistoryDetails(
  event: { fromStatus: string | null; toStatus: string; note: string | null },
  documentNames: ReadonlyMap<string, string>,
): ReviewHistoryDetails {
  const { note } = event
  if (note && event.fromStatus === 'NEEDS_REVISION' && event.toStatus === 'PENDING') {
    if (note.startsWith(legacyCorrectionsPrefix)) {
      const [ids, ...noteParts] = note.slice(legacyCorrectionsPrefix.length).split('\n\n')
      return {
        note: noteParts.join('\n\n') || null,
        correctedDocuments: ids.split('\n').filter(Boolean).map(id => ({
          id,
          originalName: documentNames.get(id) ?? null,
        })),
      }
    }

    try {
      const details = JSON.parse(note)
      if (
        Array.isArray(details?.correctedDocuments) &&
        (typeof details.note === 'string' || details.note === null) &&
        details.correctedDocuments.every((doc: { id?: unknown; originalName?: unknown } | null) =>
          typeof doc?.id === 'string' && typeof doc.originalName === 'string')
      ) return details
    } catch {
      // Some earlier resubmissions have only a plain-text note.
    }
  }
  return { note, correctedDocuments: [] }
}

export const reviewHistoryInclude = {
  include: { actor: { select: { name: true } } },
  orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
} satisfies Prisma.StudentReviewHistoryFindManyArgs
