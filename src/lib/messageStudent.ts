import { isSameOrg } from '@/src/lib/orgScope'
import { canAccessStudent } from '@/src/lib/studentAssignment'

type Viewer = { id: string; role: string; organizationId: string | null }
type StudentScope = { agentId: string | null; organizationId: string | null }
type StudentTag = StudentScope & { id: string; fullName: string; serialNumber: string | null }

export const messageStudentSelect = {
  id: true,
  fullName: true,
  serialNumber: true,
  agentId: true,
  organizationId: true,
} as const

export function canReadMessageStudent(user: Viewer, student: StudentScope | null) {
  return !!student && isSameOrg(user, student) && canAccessStudent(user, student)
}

export function serializeMessageStudent<T extends { studentId: string | null; student: StudentTag | null }>(
  user: Viewer,
  message: T,
) {
  const { student, ...fields } = message
  if (!student || !canReadMessageStudent(user, student)) {
    return { ...fields, studentId: null, student: null }
  }
  const { id, fullName, serialNumber } = student
  return { ...fields, studentId: id, student: { id, fullName, serialNumber } }
}
