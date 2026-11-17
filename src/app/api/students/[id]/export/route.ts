export const dynamic = 'force-dynamic'

import { canAccessStudent } from '@/src/lib/studentAssignment'
import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser, orgHasFeature } from '@/src/lib/session'
import { isSameOrg } from '@/src/lib/orgScope'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { buildStudentWorkbook } from '@/src/lib/studentExcel'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getEffectiveUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await orgHasFeature(user.organizationId, 'student_export'))) {
      return NextResponse.json({ error: 'Student Export is not included in your plan' }, { status: 403 })
    }

    const { id } = await params
    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        educationHistory: true,
        workExperience: true,
        familyMembers: true,
        financialSponsors: true,
      },
    })

    if (!student || !isSameOrg(user, student)) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    if (!canAccessStudent(user, student)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const wb = buildStudentWorkbook(student)
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const filename = `${student.serialNumber || student.id.slice(0, 8)}-${student.fullName}.xlsx`.replace(/[\\/:*?"<>|]/g, '-')

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Student export error:', error)
    return NextResponse.json({ error: 'Failed to export student' }, { status: 500 })
  }
}
