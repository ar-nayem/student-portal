import { prisma } from '@/src/lib/prisma'
import { parseFeatures } from '@/src/lib/features'
import { AGENT, ADMIN, OWNER } from '@/src/lib/roles'
import { requireAuthSecret } from '@/src/lib/authSecret'
import { createHmac, timingSafeEqual } from 'crypto'

// Resolves a public student-intake code to the staff member (and their active
// organization) it belongs to. Returns null for an unknown code, a user with
// no organization, a suspended organization, or an organization whose package
// doesn't include the Application Link — the caller should 404 in every one of
// those cases so a stale/guessed/unlicensed code can't be distinguished from a
// deliberately deactivated one. Gating here rather than in each route covers
// both the form-load GET and the submission POST from one place.
export async function resolveIntakeUser(code: string): Promise<{ id: string; name: string; organizationId: string; organizationName: string; role: string } | null> {
  const user = await prisma.user.findUnique({
    where: { studentIntakeCode: code },
    include: { organization: { select: { id: true, name: true, status: true, package: { select: { features: true } } } } },
  })
  if (!user?.isActive || ![AGENT, ADMIN, OWNER].includes(user.role) || user.organization?.status !== 'ACTIVE') return null

  const pkg = user.organization.package
  if (pkg && !parseFeatures(pkg.features).includes('intake_link')) return null

  return { id: user.id, name: user.name, organizationId: user.organization.id, organizationName: user.organization.name, role: user.role }
}

// Anonymous applicants may upload only against the student returned by their
// own submission. Changing the current owner invalidates the upload token.
type IntakeUploadScope = { id: string; organizationId: string | null; assignmentVersion: number }

function intakeUploadSignature(code: string, student: IntakeUploadScope, expiresAt: number) {
  return createHmac('sha256', requireAuthSecret())
    .update(JSON.stringify(['student-intake-upload-v2', code, student.id, student.organizationId, student.assignmentVersion, expiresAt]))
    .digest('hex')
}

export function issueIntakeUploadToken(code: string, student: IntakeUploadScope) {
  const expiresAt = Date.now() + 60 * 60 * 1000
  return `${expiresAt}.${intakeUploadSignature(code, student, expiresAt)}`
}

export function verifyIntakeUploadToken(code: string, student: IntakeUploadScope, token: FormDataEntryValue | null) {
  if (typeof token !== 'string' || !/^\d{13}\.[0-9a-f]{64}$/.test(token)) return false
  const [rawExpiry, signature] = token.split('.')
  const expiresAt = Number(rawExpiry)
  if (expiresAt <= Date.now()) return false

  return timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(intakeUploadSignature(code, student, expiresAt), 'hex'),
  )
}
