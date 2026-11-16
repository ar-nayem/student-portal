import Credentials from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from './prisma'
import { logActivity } from './activity'
import { DELETED, SUPER_DEVELOPER } from './roles'
import { getActiveSessionAccount } from './session'

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

        if (!user || !user.isActive || user.role === DELETED) return null
        if (user.role === SUPER_DEVELOPER && user.organizationId !== null) return null

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
      const account = user ?? await getActiveSessionAccount(token)
      token.role = account?.role ?? DELETED
      token.organizationId = account?.organizationId ?? null
      if (account) {
        token.id = account.id
        token.name = account.name
        token.email = account.email
      }
      if (token.role !== SUPER_DEVELOPER) {
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
      // NextAuth v4 treats an empty session response as signed out.
      if (token?.role === DELETED) return {}
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
