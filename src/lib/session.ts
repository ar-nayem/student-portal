import { getToken } from 'next-auth/jwt'
import { NextRequest } from 'next/server'
import { prisma } from './prisma'
import { SUPER_DEVELOPER } from './roles'
import { parseFeatures, type FeatureKey } from './features'
import { requireAuthSecret } from './authSecret'

const secret = requireAuthSecret()

export async function getSessionUser(req: NextRequest) {
  const token = await getToken({ req, secret })
  if (!token) return null
  return {
    id: token.sub as string,
    email: token.email as string,
    name: token.name as string,
    role: token.role as string,
  }
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
  /** Active org context: the impersonated org while impersonating, else the
   *  user's own org. Null only for a SUPER_DEVELOPER not impersonating anyone. */
  organizationId: string | null
  isImpersonating: boolean
}

// Like getSessionUser, but also resolves the active organization context
// (including SUPER_DEVELOPER impersonation) and enforces org suspension —
// a suspended org's users get treated as logged-out the moment they hit any
// route using this helper. Use this for every org-scoped route; getSessionUser
// stays available for routes that only need role, no org awareness.
export async function getEffectiveUser(req: NextRequest): Promise<EffectiveUser | null> {
  const token = await getToken({ req, secret })
  if (!token) return null

  const actualRole = token.role as string
  const baseOrgId = (token.organizationId as string | null | undefined) ?? null
  const impersonatingOrgId = (token.impersonatingOrgId as string | null | undefined) ?? null
  const activeOrgId = impersonatingOrgId ?? baseOrgId

  if (activeOrgId) {
    const org = await prisma.organization.findUnique({
      where: { id: activeOrgId },
      select: { status: true, accessExpiresAt: true },
    })
    // An elapsed access window locks the org out exactly like suspension —
    // a lapsed subscription and a suspended account are the same thing from
    // the app's side. The SUPER_DEVELOPER is exempt so an expired tenant can
    // still be inspected and renewed.
    const expired = !!org?.accessExpiresAt && org.accessExpiresAt.getTime() <= Date.now()
    if (!org || org.status === 'SUSPENDED' || expired) {
      if (actualRole !== SUPER_DEVELOPER) return null
    }
  }

  return {
    id: token.sub as string,
    email: token.email as string,
    name: token.name as string,
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
// toggles at any time — the JWT only carries role (set at login), so this
// needs a live DB read rather than trusting a stale token claim.
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
// Agents and owners always can; a plain admin needs the explicit grant —
// same live-DB-read pattern as canAccessPortals, since the JWT only carries
// role at login time and this flag can change mid-session.
export async function canManageOfficialDocs(user: { id: string; role: string; organizationId?: string | null } | null): Promise<boolean> {
  if (!user) return false
  if (!(await orgHasFeature(user.organizationId ?? null, 'official_documents'))) return false
  if (user.role === 'OWNER' || user.role === 'AGENT') return true
  if (user.role !== 'ADMIN') return false
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { canManageOfficialDocuments: true } })
  return !!dbUser?.canManageOfficialDocuments
}
