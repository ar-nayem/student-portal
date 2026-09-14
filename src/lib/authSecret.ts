// Single source of truth for the NextAuth/JWT signing secret. Throws instead
// of silently falling back to a hardcoded default — a missing NEXTAUTH_SECRET
// must break boot loudly, not leave the app signing tokens with a value that
// sits in public git history.
export function requireAuthSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is not set — refusing to start without it')
  }
  return secret
}
