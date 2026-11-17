import { getToken, type JWT } from 'next-auth/jwt'
import { NextRequest } from 'next/server'
import { prisma } from './prisma'
import { DELETED, SUPER_DEVELOPER } from './roles'
import { parseFeatures, type FeatureKey } from './features'
import { requireAuthSecret } from './authSecret'

const secret = requireAuthSecret()

export async function getActiveSessionAccount(token: Pick<JWT, 'sub' | 'id'>) {
  const id = token.sub ?? token.id
  if (!id) return null

  const account = await prisma.user.findUnique({
    where: { id, isActive: true, role: { not: DELETED } },
    select: { id: true, email: true, name: true, role: true, organizationId: true },
  })
  if (account?.role === SUPER_DEVELOPER && account.organizationId !== null) return null
  return account
}

export async function getSessionUser(req: NextRequest) {
  const token = await getToken({ req, secret })
  return token ? getActiveSessionAccount(token) : null
}

export interface EffectiveUser {
  id: string
  email: string
  name: string
  /** The role to authorize against. While impersonating, this reads 'OWNER'
   *  so every existing role check keeps working unmodified — see actualRole. */
  role: string
  /** The real, un-impersonated role — use this for audit logging only. */
  actualRole: string
  /** The impersonated org while impersonating, otherwise the account's own org. */
  organizationId: string | null
  isImpersonating: boolean
}

// Org-scoped routes use the live account's role and membership, resolve
// platform impersonation, and enforce tenant suspension and expiration.
export async function getEffectiveUser(req: NextRequest): Promise<EffectiveUser | null> {
  const token = await getToken({ req, secret })
  if (!token) return null

  const account = await getActiveSessionAccount(token)
  if (!account) return null

  const actualRole = account.role
  const impersonatingOrgId = actualRole === SUPER_DEVELOPER && typeof token.impersonatingOrgId === 'string'
    ? token.impersonatingOrgId || null
    : null
  const activeOrgId = impersonatingOrgId ?? account.organizationId

  // Platform operators can inspect suspended and expired organizations.
  if (activeOrgId && actualRole !== SUPER_DEVELOPER) {
    const org = await prisma.organization.findUnique({
      where: { id: activeOrgId },
      select: { status: true, accessExpiresAt: true },
    })
    if (!org || org.status === 'SUSPENDED') return null
    if (org.accessExpiresAt && org.accessExpiresAt.getTime() <= Date.now()) return null
  }

  return {
    ...account,
    role: impersonatingOrgId ? 'OWNER' : actualRole,
    actualRole,
    organizationId: activeOrgId,
    isImpersonating: !!impersonatingOrgId,
  }
}

export function isAdminRole(role: string | undefined) {
  return role === 'ADMIN' || role === 'OWNER'
}

// Null means unrestricted (no package assigned — legacy org, or a super
// developer has to explicitly put an org on a tier before anything gets
// capped). A real array means the org's package caps access to exactly
// those feature keys, even an empty list.
export async function getOrgEnabledFeatures(organizationId: string | null): Promise<string[] | null> {
  if (!organizationId) return null
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { package: { select: { features: true } } },
  })
  if (!org?.package) return null
  return parseFeatures(org.package.features)
}

// Whether an org's assigned Package (see src/lib/features.ts) includes the
// given feature.
export async function orgHasFeature(organizationId: string | null, featureKey: FeatureKey): Promise<boolean> {
  const enabled = await getOrgEnabledFeatures(organizationId)
  return enabled === null || enabled.includes(featureKey)
}

// For an API surface shared by two nav-level features (Manage Accounts and
// Alert Settings both read/write /api/users) — access if either is enabled.
export async function orgHasAnyFeature(organizationId: string | null, featureKeys: FeatureKey[]): Promise<boolean> {
  const enabled = await getOrgEnabledFeatures(organizationId)
  return enabled === null || featureKeys.some((k) => enabled.includes(k))
}

// University Portals visibility for admins is a per-account grant the owner
// toggles at any time. Read the grant from the current account.
export async function canAccessPortals(user: { id: string; role: string; organizationId?: string | null } | null): Promise<boolean> {
  if (!user) return false
  if (!(await orgHasFeature(user.organizationId ?? null, 'university_portals'))) return false
  if (user.role === 'OWNER') return true
  if (user.role !== 'ADMIN') return false
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { canViewPortals: true } })
  return !!dbUser?.canViewPortals
}

// Official documents (admission letters, JW, pre-admission letters, etc.) are
// sensitive enough that the owner decides which admins may touch them.
// Agents and owners always can; an admin needs the explicit grant.
export async function canManageOfficialDocs(user: { id: string; role: string; organizationId?: string | null } | null): Promise<boolean> {
  if (!user) return false
  if (!(await orgHasFeature(user.organizationId ?? null, 'official_documents'))) return false
  if (user.role === 'OWNER' || user.role === 'AGENT') return true
  if (user.role !== 'ADMIN') return false
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { canManageOfficialDocuments: true } })
  return !!dbUser?.canManageOfficialDocuments
}
