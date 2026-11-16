import type { Prisma } from '@prisma/client'
import { prisma } from '@/src/lib/prisma'
import { profileFields } from '@/src/lib/studentProfileFields'
import { findAssignableAgent, InvalidStudentAgent } from '@/src/lib/studentAssignment'

type NestedRows = {
  educationHistory?: any[]
  workExperience?: any[]
  familyMembers?: any[]
  financialSponsors?: any[]
}

export async function createStudentFromData(
  organizationId: string,
  { creatorId, assignedAgentId }: { creatorId: string | null; assignedAgentId: string | null },
  studentData: Record<string, unknown>,
  nested: NestedRows,
) {
  return prisma.$transaction(async tx => {
    if (assignedAgentId !== null && !(await findAssignableAgent(tx, organizationId, assignedAgentId))) {
      throw new InvalidStudentAgent()
    }

    // Scoped per-org so one agency's serial numbering (and the rough student
    // volume it implies) never leaks into another's — each org starts its own
    // GL-00001 sequence rather than sharing one platform-wide counter.
    const lastStudent = await tx.student.findFirst({
      where: { organizationId, serialNumber: { not: null } },
      select: { serialNumber: true },
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

    return tx.student.create({
      data: {
        ...profile,
        serialNumber,
        createdById: creatorId,
        agentId: assignedAgentId,
        assignmentHistory: assignedAgentId === null ? undefined : {
          create: { fromAgentId: null, toAgentId: assignedAgentId, actorId: creatorId, createdAt: new Date() },
        },
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
  })
}
