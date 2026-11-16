import type { EffectiveUser } from './session'
import { SUPER_DEVELOPER } from './roles'

export function canManageSiteContent(user: EffectiveUser | null, { platformOnly = false } = {}) {
  if (!user) return false
  if (user.actualRole === SUPER_DEVELOPER) return true
  if (platformOnly) return false
  const ids = (process.env.EDVUNO_CONTENT_EDITOR_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
  return !user.isImpersonating && ids.includes(user.id) && ['OWNER', 'ADMIN'].includes(user.actualRole)
}
