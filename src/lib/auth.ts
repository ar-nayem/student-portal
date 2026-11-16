import Credentials from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from './prisma'
import { logActivity } from './activity'
import { DELETED, SUPER_DEVELOPER } from './roles'

export const authConfig: any = {
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        // Email only — name was never unique even single-tenant, and
        // multi-tenant it's a real cross-org auth risk if two orgs happen to
        // have identically-named staff.
        const identifier = (credentials.email as string).trim()

        const user = await prisma.user.findUnique({ where: { email: identifier } })

        if (!user || !user.isActive) return null

        const isValid = await compare(credentials.password as string, user.password)
        if (!isValid) return null

        await logActivity(user.id, 'LOGIN', `Signed in as ${user.role}`)

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId
        }
      }
    })
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user, trigger, session }: { token: any; user: any; trigger?: string; session?: any }) {
      if (user) {
        token.role = user.role
        token.id = user.id
        token.organizationId = user.organizationId ?? null
      } else if (token.organizationId === undefined) {
        // Self-heals any session that was already issued before this claim
        // existed on the token (e.g. everyone logged in at deploy time) —
        // undefined (never set) is distinct from null (deliberately no org,
        // like a SUPER_DEVELOPER). Left unhealed, role-based page redirects
        // that depend on organizationId being present loop forever. Runs
        // once per session: after this, organizationId is baked into the
        // re-signed token and this branch won't fire again.
        const dbUser = await prisma.user.findUnique({
          where: { id: (token.id ?? token.sub) as string },
          select: { role: true, organizationId: true },
        })
        token.role = dbUser?.role ?? token.role
        token.organizationId = dbUser?.organizationId ?? null
      }
      if (token.role !== SUPER_DEVELOPER) {
        delete token.impersonatingOrgId
        return token
      }

      const id = token.sub ?? token.id
      const platformUser = id ? await prisma.user.findUnique({
        where: { id },
        select: { role: true, organizationId: true, isActive: true },
      }) : null
      if (!platformUser?.isActive || platformUser.role !== SUPER_DEVELOPER) {
        token.role = platformUser?.isActive ? platformUser.role : DELETED
        token.organizationId = platformUser?.isActive ? platformUser.organizationId : null
        delete token.impersonatingOrgId
        return token
      }

      // Only a live platform developer can enter or leave a tenant via session.update.
      if (trigger === 'update' && session && typeof session === 'object' && 'impersonatingOrgId' in session) {
        const organizationId = session.impersonatingOrgId
        if (organizationId === null) {
          delete token.impersonatingOrgId
        } else if (typeof organizationId === 'string' && organizationId) {
          const organization = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: { id: true },
          })
          if (organization) token.impersonatingOrgId = organization.id
        }
      }
      return token
    },
    async session({ session, token }: { session: any; token: any }) {
      if (token) {
        const actualRole = token.role as string
        const impersonatingOrgId = actualRole === SUPER_DEVELOPER && typeof token.impersonatingOrgId === 'string'
          ? token.impersonatingOrgId || null
          : null
        const baseOrgId = (token.organizationId as string | null) ?? null
        // While impersonating, expose the effective role ('OWNER') and the
        // active org (the impersonated one) so every existing client-side
        // `role !== 'OWNER'` gate and any org-id read across the app keeps
        // working unmodified — mirrors getEffectiveUser's server-side
        // semantics exactly. actualRole is there for the rare cases (the
        // impersonation banner itself) that need to know the user is really
        // a SUPER_DEVELOPER.
        session.user.role = impersonatingOrgId ? 'OWNER' : actualRole
        session.user.actualRole = actualRole
        session.user.id = token.id as string
        session.user.organizationId = impersonatingOrgId ?? baseOrgId
        session.user.impersonatingOrgId = impersonatingOrgId
      }
      return session
    }
  },
  session: {
    strategy: 'jwt'
  }
}
