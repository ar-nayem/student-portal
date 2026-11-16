import { getServerSession, type Session } from 'next-auth'
import { redirect } from 'next/navigation'
import { authConfig } from '@/src/lib/auth'
import { SUPER_DEVELOPER } from '@/src/lib/roles'

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authConfig) as Session | null
  if (!session?.user) redirect('/login')
  if (session.user.actualRole !== SUPER_DEVELOPER) redirect('/dashboard')

  return children
}
