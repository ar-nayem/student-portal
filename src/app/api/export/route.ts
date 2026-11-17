export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser, isAdminRole, orgHasFeature } from '@/src/lib/session'
import type { Prisma } from '@prisma/client'
import { adminStudentAssignmentFilter } from '@/src/lib/studentAssignment'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET(req: NextRequest) {
  try {
    const user = await getEffectiveUser(req)
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await orgHasFeature(user.organizationId, 'data_export'))) {
      return NextResponse.json({ error: 'Data Export is not included in your plan' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const format = searchParams.get('format') || 'xlsx'
    const status = searchParams.get('status')
    const agentId = searchParams.get('agentId')

    if (!user.organizationId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const where: Prisma.StudentWhereInput = { organizationId: user.organizationId, ...await adminStudentAssignmentFilter(user, agentId) }
    if (status) where.status = status

    const students = await prisma.student.findMany({
      where,
      include: {
        agent: { select: { name: true } },
        createdBy: { select: { name: true } },
        documents: true,
        educationHistory: true,
        workExperience: true,
        familyMembers: true,
        financialSponsors: true,
      },
      orderBy: { createdAt: 'desc' }
    })

    const data = students.map(s => ({
      'ID': s.id,
      'Passport Family Name': s.passportFamilyName,
      'Given Name': s.givenName,
      'Full Name': s.fullName,
      'Gender': s.gender,
      'Chinese Name': s.chineseName || '',
      'Marital Status': s.maritalStatus,
      'Religion': s.religion,
      'Occupation': s.occupation,
      'Employer/Institution': s.employerInstitution || '',
      'Nationality': s.nationality,
      'Date of Birth': s.dateOfBirth,
      'Country of Birth': s.countryOfBirth,
      'Place of Birth': s.placeOfBirth,
      'Years in Home Country': s.yearsInHomeCountry || '',
      'WeChat': s.wechat || '',
      'Chinese Descent': s.chineseDescent,
      'Currently in China': s.currentlyInChina,
      'Home Address': s.homeAddress || '',
      'Detailed Address': s.detailedAddress,
      'City/Province': s.cityProvince,
      'Country': s.country,
      'Zipcode': s.zipcode,
      'Phone/Mobile': s.phoneMobile,
      'Main Email': s.mainEmail,
      'Passport No.': s.passportNo,
      'Passport Expiry': s.passportExpiryDate,
      'Old Passport No.': s.oldPassportNo || '',
      'Old Passport Expiry': s.oldPassportExpiry || '',
      'Studied in China': s.studiedInChina,
      'Visa Type': s.visaType || '',
      'China Institution': s.chinaInstitution || '',
      'Visa Expiry': s.visaExpiryDate || '',
      'Study in China From': s.studyInChinaFrom || '',
      'Study in China To': s.studyInChinaTo || '',
      'Program Applied': s.programApplied || '',
      'Status': s.status,
      'Agent': s.agent?.name || '',
      'Submitted by': s.createdBy?.name || '',
      'Documents Count': s.documents.length,
      'Education Count': s.educationHistory.length,
      'Work Count': s.workExperience.length,
      'Family Count': s.familyMembers.length,
      'Sponsors Count': s.financialSponsors.length,
      'Notes': s.notes || '',
      'Created At': s.createdAt.toISOString(),
    }))

    if (format === 'xlsx') {
      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Students')
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
      
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="students-export-${Date.now()}.xlsx"`
        }
      })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json({ error: 'Failed to export' }, { status: 500 })
  }
}
