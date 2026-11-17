export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { issueIntakeUploadToken, resolveIntakeUser } from '@/src/lib/intake'
import { NextRequest, NextResponse } from 'next/server'
import { sendNotification, studentSubmissionTemplate } from '@/src/lib/email'
import { logActivity } from '@/src/lib/activity'
import { createStudentFromData } from '@/src/lib/createStudent'
import { AGENT } from '@/src/lib/roles'
import { InvalidStudentAgent } from '@/src/lib/studentAssignment'

// Fields an anonymous applicant may set. Internal-only Student columns
// (totalFee, myCosting, status, serialNumber, agentId, organizationId, ...)
// are deliberately excluded — an allowlist here, not a denylist, so any
// future staff-only field added to the schema is safe by default.
const PUBLIC_STUDENT_FIELDS = [
  'passportFamilyName', 'givenName', 'fullName', 'photo', 'gender', 'chineseName',
  'maritalStatus', 'religion', 'occupation', 'employerInstitution', 'nationality',
  'dateOfBirth', 'yearsInHomeCountry', 'countryOfBirth', 'wechat', 'placeOfBirth',
  'chineseDescent', 'currentlyInChina', 'homeAddress', 'detailedAddress', 'cityProvince',
  'country', 'zipcode', 'phoneMobile', 'mainEmail', 'passportNo', 'passportExpiryDate',
  'oldPassportNo', 'oldPassportExpiry', 'studiedInChina', 'visaType', 'chinaInstitution',
  'visaExpiryDate', 'studyInChinaFrom', 'studyInChinaTo', 'programApplied', 'notes',
]

// Public — no auth. Lets the apply page confirm a staff member's intake
// code is real (and pull the org's document/field requirements) before
// showing the application form.
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params
    const agent = await resolveIntakeUser(code)
    if (!agent) {
      return NextResponse.json({ error: 'This application link is invalid or no longer active' }, { status: 404 })
    }

    const [docCategories, fieldRequirements] = await Promise.all([
      prisma.documentRequirement.findMany({
        where: { active: true, organizationId: agent.organizationId },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.fieldRequirement.findMany({
        where: { active: true, organizationId: agent.organizationId },
        orderBy: { sortOrder: 'asc' },
      }),
    ])

    return NextResponse.json({
      agentName: agent.name,
      organizationName: agent.organizationName,
      docCategories,
      fieldRequirements,
    })
  } catch (error) {
    console.error('GET /api/public/intake/[code] error:', error)
    return NextResponse.json({ error: 'Failed to load application link' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params
    const agent = await resolveIntakeUser(code)
    if (!agent) {
      return NextResponse.json({ error: 'This application link is invalid or no longer active' }, { status: 404 })
    }

    const body = await req.json()
    const { educationHistory, workExperience, familyMembers, financialSponsors } = body
    const studentData: Record<string, unknown> = {}
    for (const key of PUBLIC_STUDENT_FIELDS) {
      if (key in body) studentData[key] = body[key]
    }

    const assignedAgentId = agent.role === AGENT ? agent.id : null
    const student = await createStudentFromData(agent.organizationId, { creatorId: null, assignedAgentId }, studentData, {
      educationHistory, workExperience, familyMembers, financialSponsors,
    })

    await sendNotification(
      'New Student Submission',
      studentSubmissionTemplate(`Public application link (${agent.name})`, student.fullName),
      agent.organizationId
    )
    await logActivity(agent.id, 'STUDENT_CREATED', `${student.fullName} (${student.serialNumber})`)

    return NextResponse.json({
      id: student.id,
      serialNumber: student.serialNumber,
      uploadToken: issueIntakeUploadToken(code, student),
    }, { status: 201 })
  } catch (error: any) {
    if (error instanceof InvalidStudentAgent) {
      return NextResponse.json({ error: 'This application link is invalid or no longer active' }, { status: 404 })
    }
    console.error('POST /api/public/intake/[code] error:', error)
    return NextResponse.json({ error: 'Failed to submit application', details: error?.message || String(error) }, { status: 500 })
  }
}
