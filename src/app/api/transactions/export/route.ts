export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser, isAdminRole, orgHasFeature } from '@/src/lib/session'
import { orgWhere } from '@/src/lib/orgScope'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { canAccessStudent } from '@/src/lib/studentAssignment'

export async function GET(req: NextRequest) {
  try {
    const user = await getEffectiveUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await orgHasFeature(user.organizationId, 'finance'))) {
      return NextResponse.json({ error: 'Finance is not included in your plan' }, { status: 403 })
    }
    if (!(await orgHasFeature(user.organizationId, 'finance_export'))) {
      return NextResponse.json({ error: 'Transaction Export is not included in your plan' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const view = searchParams.get('view')
    const personId = searchParams.get('personId')

    // Same personal-vs-org scoping as GET /api/transactions, including the
    // same fix: an ADMIN with zero agents assigned yet must not fall through
    // to an unfiltered createdById, so orgWhere is merged in unconditionally
    // below regardless of which branch runs here.
    const where: any = {}
    if (view === 'org' && isAdminRole(user.role)) {
      if (user.role === 'ADMIN') {
        const managed = await prisma.user.findMany({ where: { managedByAdminId: user.id }, select: { id: true } })
        const allowedIds = managed.length > 0 ? [...managed.map(m => m.id), user.id] : null
        if (personId) {
          where.createdById = allowedIds && !allowedIds.includes(personId) ? '__none__' : personId
        } else if (allowedIds) {
          where.createdById = { in: allowedIds }
        }
      } else if (personId) {
        where.createdById = personId
      }
    } else {
      where.createdById = user.id
    }
    Object.assign(where, orgWhere(user))

    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    if (dateFrom || dateTo) {
      where.transactionDate = {}
      if (dateFrom) where.transactionDate.gte = new Date(dateFrom)
      if (dateTo) where.transactionDate.lte = new Date(dateTo + 'T23:59:59.999Z')
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        student: { select: { fullName: true, serialNumber: true, status: true, agentId: true, organizationId: true } },
        agent: { select: { name: true, email: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { transactionDate: 'desc' },
    })

    const data = transactions.map(tx => ({
      'Date': tx.transactionDate.toISOString().slice(0, 10),
      'Type': tx.type,
      'Category': tx.category,
      'Amount': tx.amount,
      'Currency': tx.currency,
      'Payment Method': tx.paymentMethod || '',
      'Status': tx.status,
      'Student': tx.student.fullName,
      'Serial No.': tx.student.serialNumber || '',
      'Student Status': tx.student.organizationId === user.organizationId && canAccessStudent(user, tx.student) ? tx.student.status : '',
      'Agent': tx.agent.name,
      'Logged By': tx.createdBy.name,
      'Description': tx.description || '',
      'Created At': tx.createdAt.toISOString(),
    }))

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="finance-export-${Date.now()}.xlsx"`,
      },
    })
  } catch (error) {
    console.error('GET /api/transactions/export error:', error)
    return NextResponse.json({ error: 'Failed to export' }, { status: 500 })
  }
}
