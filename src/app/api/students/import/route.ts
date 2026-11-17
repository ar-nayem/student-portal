export const dynamic = 'force-dynamic'

import { getEffectiveUser, isAdminRole, orgHasFeature } from '@/src/lib/session'
import { requireOrgId } from '@/src/lib/orgScope'
import { NextRequest, NextResponse } from 'next/server'
import { parseStudentWorkbook, REQUIRED_FLAT_KEYS } from '@/src/lib/studentExcel'
import { createStudentFromData } from '@/src/lib/createStudent'
import { sendNotification, studentSubmissionTemplate } from '@/src/lib/email'
import { logActivity } from '@/src/lib/activity'
import { InvalidStudentAgent, staffAssignedAgent } from '@/src/lib/studentAssignment'

export async function POST(req: NextRequest) {
  try {
    const user = await getEffectiveUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isAdminRole(user.role) && user.role !== 'AGENT') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!(await orgHasFeature(user.organizationId, 'student_import'))) {
      return NextResponse.json({ error: 'Excel Import is not included in your plan' }, { status: 403 })
    }

    const orgId = requireOrgId(user)
    if (!orgId) return NextResponse.json({ error: 'No active organization context' }, { status: 400 })

    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    const assignedAgentId = staffAssignedAgent(user, formData.get('agentId'))

    const buffer = Buffer.from(await file.arrayBuffer())
    const entries = parseStudentWorkbook(buffer)

    if (entries.length === 0) {
      return NextResponse.json({ error: 'No student rows found in the "Student" sheet' }, { status: 400 })
    }

    const created: { id: string; fullName: string; serialNumber: string | null }[] = []
    const failed: { row: number; name: string; error: string }[] = []

    // Sequential on purpose: serial numbers are assigned by querying the current max,
    // so concurrent creates could race and hand out duplicate serials.
    for (let i = 0; i < entries.length; i++) {
      const { studentData, educationHistory, workExperience, familyMembers, financialSponsors } = entries[i]
      const rowLabel = studentData.fullName || studentData.passportNo || `Row ${i + 2}`

      const missing = REQUIRED_FLAT_KEYS.filter(f => !studentData[f])
      if (missing.length > 0) {
        failed.push({ row: i + 2, name: rowLabel, error: `Missing required fields: ${missing.join(', ')}` })
        continue
      }

      try {
        const student = await createStudentFromData(orgId, { creatorId: user.id, assignedAgentId }, studentData, {
          educationHistory, workExperience, familyMembers, financialSponsors,
        })
        created.push({ id: student.id, fullName: student.fullName, serialNumber: student.serialNumber })
        await logActivity(user.id, 'STUDENT_CREATED', `${student.fullName} (${student.serialNumber}) via Excel import`)
        sendNotification(
          'New Student Submission',
          studentSubmissionTemplate(user.name, student.fullName),
          orgId
        ).catch(() => {})
      } catch (rowError: any) {
        if (rowError instanceof InvalidStudentAgent && created.length === 0) throw rowError
        failed.push({ row: i + 2, name: rowLabel, error: rowError?.message || 'Failed to create student' })
      }
    }

    return NextResponse.json({ created, failed, totalRows: entries.length }, { status: created.length > 0 ? 201 : 400 })
  } catch (error: any) {
    if (error instanceof InvalidStudentAgent) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Student import error:', error)
    return NextResponse.json({ error: 'Failed to import students', details: error?.message || String(error) }, { status: 500 })
  }
}
