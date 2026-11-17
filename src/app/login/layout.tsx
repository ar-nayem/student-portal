import { getServerSession, type Session } from 'next-auth'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { authConfig } from '@/src/lib/auth'
import { isAdminRole } from '@/src/lib/session'

export default async function LoginLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authConfig) as Session | null
  if (session?.user && (!isAdminRole(session.user.role) || session.user.organizationId)) {
    redirect('/dashboard')
  }
  return children
}
