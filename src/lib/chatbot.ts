import { GoogleGenAI } from '@google/genai'
import { prisma } from '@/src/lib/prisma'
import type { Prisma } from '@prisma/client'
import { AGENT, ADMIN, OWNER } from '@/src/lib/roles'
import { adminStudentAssignmentFilter } from '@/src/lib/studentAssignment'

export type SessionUser = { id: string; role: string; organizationId: string | null } | null

export function computeOfferStatus(offer: { startDate: Date | string; endDate: Date | string | null; isActive: boolean }) {
  if (!offer.isActive) return 'PAUSED'
  const now = Date.now()
  const start = new Date(offer.startDate).getTime()
  const end = offer.endDate ? new Date(offer.endDate).getTime() : null
  if (now < start) return 'UPCOMING'
  if (end !== null && now > end) return 'EXPIRED'
  return 'RUNNING'
}

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null

// organizationId is only known for a logged-in user — a logged-out visitor
// has no org signal on this single-domain deployment (same accepted gap as
// the public GET /api/offers endpoint), so that case stays unscoped.
async function liveOffersContext(organizationId?: string | null) {
  const offers = await prisma.offer.findMany({
    where: { isActive: true, ...(organizationId ? { organizationId } : {}) },
    orderBy: { startDate: 'asc' },
  })
  const live = offers
    .map(o => ({ ...o, status: computeOfferStatus(o) }))
    .filter(o => o.status === 'RUNNING' || o.status === 'UPCOMING')

  if (live.length === 0) return 'No running or upcoming offers right now.'

  return live
    .map(o => {
      const tag = o.status === 'RUNNING' ? 'Running now' : `Upcoming (from ${new Date(o.startDate).toLocaleDateString()})`
      const end = o.endDate ? `, ends ${new Date(o.endDate).toLocaleDateString()}` : ''
      return `- ${o.title} [${tag}${end}]: ${o.description}`
    })
    .join('\n')
}

// Best-effort entity match so we only ever inject ONE student's data into the
// prompt (never a full roster) — keeps the LLM context small and prevents a
// vague question like "how are my students doing" from dumping everyone's PII.
async function matchedStudentContext(user: { id: string; role: string; organizationId: string | null }, message: string): Promise<string | null> {
  const tokens = message.split(/\s+/).map(t => t.trim()).filter(t => t.length >= 4)
  if (tokens.length === 0) return null

  if (!user.organizationId || ![AGENT, ADMIN, OWNER].includes(user.role)) return null
  const where: Prisma.StudentWhereInput = {
    organizationId: user.organizationId,
    ...(user.role === AGENT ? { agentId: user.id } : await adminStudentAssignmentFilter(user)),
    AND: [{ OR: tokens.flatMap(t => [
      { serialNumber: { contains: t } },
      { passportNo: { contains: t } },
      { fullName: { contains: t } },
    ]) }],
  }

  const student = await prisma.student.findFirst({
    where,
    include: {
      agent: { select: { name: true } },
      portalSnapshots: { orderBy: { lastSeenAt: 'desc' }, take: 1 },
    },
  })
  if (!student) return null

  const snapshot = student.portalSnapshots[0]
  const lines = [
    `Name: ${student.fullName}`,
    `Serial number: ${student.serialNumber || 'not assigned yet'}`,
    `Internal status: ${student.status}`,
    `Agent: ${student.agent?.name ?? 'Unassigned'}`,
  ]
  if (snapshot) {
    lines.push(`University portal — applied: ${snapshot.applyStatus || 'unknown'}, admitted: ${snapshot.admitStatus || 'unknown'} (last checked ${new Date(snapshot.lastSeenAt).toLocaleDateString()})`)
  }
  return lines.join('\n')
}

const FALLBACK_REPLY = "Sorry, I'm having trouble answering right now. Please try again in a moment, or contact us directly."

export async function getChatbotReply(message: string, user: SessionUser) {
  const text = message.trim()
  if (!text) return { reply: 'Ask me about our current offers, or (if you\'re logged in) a student\'s application status.' }

  if (!gemini) {
    console.error('Chatbot: GEMINI_API_KEY is not set')
    return { reply: FALLBACK_REPLY }
  }

  const offersBlock = await liveOffersContext(user?.organizationId)
  const studentBlock = user ? await matchedStudentContext(user, text) : null

  const systemPrompt = [
    'You are the assistant for a study-abroad agency\'s student portal. Answer only using the DATA sections below — never invent offers, dates, or student information that isn\'t given to you.',
    'Keep replies short (2-4 sentences), plain text, no markdown headers.',
    'If asked about offers/promotions/discounts, summarize from CURRENT OFFERS.',
    user
      ? 'The user is logged-in staff. If they ask about a specific student and STUDENT MATCH is empty, tell them you couldn\'t find a match and ask for the student\'s serial number, passport number, or full name. Never guess or fabricate student data.'
      : 'The user is a public site visitor, not logged in. If they ask about a specific student\'s status, tell them to log in to the portal — you cannot look up student records for logged-out visitors.',
    '',
    '--- CURRENT OFFERS ---',
    offersBlock,
    '--- STUDENT MATCH (only relevant if the user asked about a specific student) ---',
    studentBlock || '(none found for this question)',
  ].join('\n')

  try {
    const response = await gemini.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: text,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 600,
      },
    })
    const reply = response.text?.trim()
    return { reply: reply || FALLBACK_REPLY }
  } catch (error) {
    console.error('Gemini chatbot error:', error)
    return { reply: FALLBACK_REPLY }
  }
}
