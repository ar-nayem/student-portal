import { createHmac, timingSafeEqual } from 'crypto'
import { requireAuthSecret } from './authSecret'

const secret = requireAuthSecret()

// One-click unsubscribe links need to work without a login — a stateless
// HMAC means we don't need a separate token table, just recompute and compare.
export function unsubscribeToken(email: string) {
  return createHmac('sha256', secret).update(email.trim().toLowerCase()).digest('hex').slice(0, 32)
}

export function verifyUnsubscribeToken(email: string, token: string) {
  const expected = unsubscribeToken(email)
  const a = Buffer.from(expected)
  const b = Buffer.from(token || '')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
