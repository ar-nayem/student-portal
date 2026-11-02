import type { EffectiveUser } from './session'
export function canManageSiteContent(user: EffectiveUser | null) {
  if (!user) return false
  if (user.actualRole === 'SUPER_DEVELOPER') return true
  const ids = (process.env.EDVUNO_CONTENT_EDITOR_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
  return !user.isImpersonating && ids.includes(user.id) && ['OWNER', 'ADMIN'].includes(user.actualRole)
}
