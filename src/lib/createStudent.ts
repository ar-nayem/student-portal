import type { Prisma } from '@prisma/client'
import { prisma } from '@/src/lib/prisma'
import { profileFields } from '@/src/lib/studentProfileFields'

type NestedRows = {
  educationHistory?: any[]
  workExperience?: any[]
  familyMembers?: any[]
  financialSponsors?: any[]
}

export async function createStudentFromData(agentId: string, organizationId: string, studentData: Record<string, unknown>, nested: NestedRows) {
  // Scoped per-org so one agency's serial numbering (and the rough student
  // volume it implies) never leaks into another's — each org starts its own
  // GL-00001 sequence rather than sharing one platform-wide counter.
  const lastStudent = await prisma.student.findFirst({
    where: { organizationId, serialNumber: { not: null } },
    orderBy: { serialNumber: 'desc' },
  })
  let nextNum = 1
  if (lastStudent?.serialNumber) {
    const match = lastStudent.serialNumber.match(/(\d+)$/)
    if (match) nextNum = parseInt(match[1], 10) + 1
  }
  const serialNumber = `GL-${String(nextNum).padStart(5, '0')}`

  // Student submissions may supply profile fields, never nested workflow records.
  const profile = Object.fromEntries(
    profileFields
      .filter(field => Object.hasOwn(studentData, field))
      .map(field => [field, studentData[field]])
  ) as Pick<Prisma.StudentUncheckedCreateInput, (typeof profileFields)[number]>

  return prisma.student.create({
    data: {
      ...profile,
      serialNumber,
      agentId,
      organizationId,
      status: 'PENDING',
      educationHistory: nested.educationHistory?.length ? { create: nested.educationHistory } : undefined,
      workExperience: nested.workExperience?.length ? { create: nested.workExperience } : undefined,
      familyMembers: nested.familyMembers?.length ? { create: nested.familyMembers } : undefined,
      financialSponsors: nested.financialSponsors?.length ? { create: nested.financialSponsors } : undefined,
    },
    include: {
      agent: { select: { name: true, email: true } },
      documents: true,
      educationHistory: true,
      workExperience: true,
      familyMembers: true,
      financialSponsors: true,
    },
  })
}
