export const dynamic = 'force-dynamic'

import { canAccessStudent, findAssignableAgent, InvalidStudentAgent } from '@/src/lib/studentAssignment'
import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser, isAdminRole, orgHasFeature } from '@/src/lib/session'
import { orgWhere, isSameOrg, requireOrgId } from '@/src/lib/orgScope'
import { NextRequest, NextResponse } from 'next/server'
import { logActivity } from '@/src/lib/activity'
import { TRANSACTION_CATEGORIES, PAYMENT_METHODS, TRANSACTION_STATUSES } from '@/src/lib/money'

// Each person's finance is their own — scoped by who actually logged the
// transaction (createdById), not by which agent's student it happened to be
// for. Otherwise an admin/owner logging a transaction would silently inflate
// whichever agent owns that student instead of counting toward their own
// numbers. Admin/Owner can opt into a combined "org" view via ?view=org.
async function scopeWhere(user: { id: string; role: string }, searchParams: URLSearchParams) {
  const where: any = {}
  const view = searchParams.get('view')
  const personId = searchParams.get('personId')

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

  return where
}

export async function GET(req: NextRequest) {
  try {
    const user = await getEffectiveUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await orgHasFeature(user.organizationId, 'finance'))) {
      return NextResponse.json({ error: 'Finance is not included in your plan' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const studentId = searchParams.get('studentId')

    let where: any
    if (studentId) {
      // Entity view: a single student's full money picture, regardless of
      // who logged each entry — same access rule as the student record itself.
      const student = await prisma.student.findUnique({ where: { id: studentId }, select: { agentId: true, organizationId: true } })
      if (!student || !isSameOrg(user, student)) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
      if (!canAccessStudent(user, student)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      where = { studentId, ...(isAdminRole(user.role) ? {} : { student: { agentId: user.id, organizationId: student.organizationId } }) }
    } else {
      where = await scopeWhere(user, searchParams)
    }
    // scopeWhere's view=org branch has a bug when an ADMIN has zero agents
    // assigned yet: allowedIds stays null and where.createdById is left
    // unset, which would leak every org's transactions. Closing that (and
    // the general cross-org case) unconditionally, regardless of which
    // branch above ran.
    where = { ...where, ...orgWhere(user) }

    const type = searchParams.get('type')
    if (type) where.type = type
    const category = searchParams.get('category')
    if (category) where.category = category
    const status = searchParams.get('status')
    if (status) where.status = status
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    if (dateFrom || dateTo) {
      where.transactionDate = {}
      if (dateFrom) where.transactionDate.gte = new Date(dateFrom)
      if (dateTo) where.transactionDate.lte = new Date(dateTo + 'T23:59:59.999Z')
    }
    const search = searchParams.get('search')
    if (search) {
      where.OR = [
        { description: { contains: search } },
        { category: { contains: search } },
        { student: { fullName: { contains: search } } },
      ]
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        student: { select: { id: true, fullName: true, serialNumber: true, status: true, agentId: true, organizationId: true } },
        agent: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { transactionDate: 'desc' },
    })

    return NextResponse.json(transactions.map(({ student, ...transaction }) => {
      const canViewStudent = student.organizationId === user.organizationId && canAccessStudent(user, student)
      const { id, fullName, serialNumber, status } = student
      return {
        ...transaction,
        canViewStudent,
        student: { id, fullName, serialNumber, ...(canViewStudent ? { status } : {}) },
      }
    }))
  } catch (error) {
    console.error('GET /api/transactions error:', error)
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getEffectiveUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await orgHasFeature(user.organizationId, 'finance'))) {
      return NextResponse.json({ error: 'Finance is not included in your plan' }, { status: 403 })
    }

    const orgId = requireOrgId(user)
    if (!orgId) return NextResponse.json({ error: 'No active organization context' }, { status: 400 })

    const body = await req.json()
    const { studentId, agentId: requestedAgentId, type, category, amount, currency, paymentMethod, status, description, transactionDate } = body
    const explicitAgentId: string | null = typeof requestedAgentId === 'string' ? requestedAgentId.trim() || null : null
    if (requestedAgentId != null && !explicitAgentId) {
      return NextResponse.json({ error: 'Invalid agentId' }, { status: 400 })
    }

    if (!studentId || typeof studentId !== 'string') {
      return NextResponse.json({ error: 'studentId is required' }, { status: 400 })
    }
    if (type !== 'INCOME' && type !== 'EXPENSE') {
      return NextResponse.json({ error: 'type must be INCOME or EXPENSE' }, { status: 400 })
    }
    if (!category || !TRANSACTION_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }
    const amountNum = Number(amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
    }
    if (paymentMethod && !PAYMENT_METHODS.includes(paymentMethod)) {
      return NextResponse.json({ error: 'Invalid paymentMethod' }, { status: 400 })
    }
    if (status && !TRANSACTION_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const result = await prisma.$transaction(async tx => {
      const student = await tx.student.findUnique({
        where: { id: studentId, organizationId: orgId },
        select: { agentId: true },
      })
      if (!student) return { error: 'Student not found', status: 404 } as const
      if (!canAccessStudent(user, student)) return { error: 'Forbidden', status: 403 } as const
      if (explicitAgentId) {
        if (!isAdminRole(user.role) && explicitAgentId !== user.id) {
          return { error: 'Forbidden', status: 403 } as const
        }
        if (!(await findAssignableAgent(tx, orgId, explicitAgentId))) throw new InvalidStudentAgent()
      }

      const transaction = await tx.transaction.create({
        data: {
          studentId,
          // Attribution is a snapshot. Future student reassignments leave it intact.
          agentId: explicitAgentId ?? student.agentId ?? user.id,
          createdById: user.id,
          organizationId: orgId,
          type,
          category,
          amount: amountNum,
          currency: currency || 'CNY',
          paymentMethod: paymentMethod || null,
          status: status || 'COMPLETED',
          description: description || null,
          transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
        },
        include: {
          student: { select: { id: true, fullName: true, serialNumber: true } },
          agent: { select: { id: true, name: true } },
        },
      })
      return { transaction } as const
    })

    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
    const { transaction } = result

    await logActivity(
      user.id,
      'TRANSACTION_CREATED',
      `${type} ${transaction.currency} ${amountNum} (${category}) for ${transaction.student.fullName}`
    )

    return NextResponse.json(transaction, { status: 201 })
  } catch (error) {
    if (error instanceof InvalidStudentAgent) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('POST /api/transactions error:', error)
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
  }
}
