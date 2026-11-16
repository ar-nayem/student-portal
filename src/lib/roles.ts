// Typo-safety only — `User.role` stays a plain string column (not a Prisma
// enum) because it already carries the non-role sentinel 'DELETED' for
// soft-deleted accounts, which an enum would fight.
export const SUPER_DEVELOPER = 'SUPER_DEVELOPER'
export const OWNER = 'OWNER'
export const ADMIN = 'ADMIN'
export const AGENT = 'AGENT'
export const DELETED = 'DELETED'

export function isOrgAssignableRole(role: unknown): role is typeof ADMIN | typeof AGENT {
  return role === ADMIN || role === AGENT
}
