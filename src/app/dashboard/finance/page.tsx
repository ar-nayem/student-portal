'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import {
  Wallet, TrendingUp, TrendingDown, Clock3, Plus, Download,
  Search, Trash2, Eye, Receipt
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/src/lib/i18n/LanguageContext'
import { useFeatures } from '@/src/lib/FeaturesContext'
import { formatMoney, TRANSACTION_CATEGORIES } from '@/src/lib/money'
import { TransactionFormModal, CATEGORY_KEYS, STATUS_KEYS } from '@/src/components/TransactionFormModal'

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function startOfLastMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() - 1, 1) }
function endOfLastMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 0) }
function startOfYear(d: Date) { return new Date(d.getFullYear(), 0, 1) }
function toISODate(d: Date) { return d.toISOString().slice(0, 10) }

export default function FinancePage() {
  const { data: session } = useSession()
  const { t, formatDate } = useLanguage()
  const { has: hasFeature } = useFeatures()

  const [transactions, setTransactions] = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])
  const [allMyTransactions, setAllMyTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [rangePreset, setRangePreset] = useState('ALL')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date()
    if (rangePreset === 'THIS_MONTH') return { dateFrom: toISODate(startOfMonth(now)), dateTo: toISODate(now) }
    if (rangePreset === 'LAST_MONTH') return { dateFrom: toISODate(startOfLastMonth(now)), dateTo: toISODate(endOfLastMonth(now)) }
    if (rangePreset === 'THIS_YEAR') return { dateFrom: toISODate(startOfYear(now)), dateTo: toISODate(now) }
    if (rangePreset === 'CUSTOM') return { dateFrom: customFrom, dateTo: customTo }
    return { dateFrom: '', dateTo: '' }
  }, [rangePreset, customFrom, customTo])

  useEffect(() => {
    fetch('/api/students', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setStudents(Array.isArray(data) ? data : []))
      .catch(() => {})

    // Unfiltered (no date/search/type params) so Total Fee/Costing/Due below
    // always reflect the real all-time balance, not whatever date range or
    // search happens to be active in the transactions table filters.
    fetch('/api/transactions', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setAllMyTransactions(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!session?.user) return
    fetchTransactions()
  }, [session, search, typeFilter, categoryFilter, statusFilter, dateFrom, dateTo])

  async function fetchTransactions() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (typeFilter) params.set('type', typeFilter)
      if (categoryFilter) params.set('category', categoryFilter)
      if (statusFilter) params.set('status', statusFilter)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/transactions?${params}`, { credentials: 'include' })
      const data = await res.json()
      setTransactions(Array.isArray(data) ? data : [])
    } catch {
      toast.error(t('finance.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  async function deleteTransaction(id: string) {
    if (!confirm(t('finance.deleteConfirm'))) return
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error()
      toast.success(t('finance.deleted'))
      fetchTransactions()
    } catch {
      toast.error(t('finance.deleteFailed'))
    }
  }

  async function exportExcel() {
    const params = new URLSearchParams()
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    const res = await fetch(`/api/transactions/export?${params}`, { credentials: 'include' })
    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finance-export-${Date.now()}.xlsx`
    a.click()
  }

  const totals = useMemo(() => {
    let charged = 0, spent = 0, outstanding = 0, refunded = 0
    for (const tx of transactions) {
      if (tx.type === 'INCOME') {
        if (tx.status === 'COMPLETED') charged += tx.amount
        else if (tx.status === 'PENDING') outstanding += tx.amount
        else if (tx.status === 'REFUNDED') refunded += tx.amount
      } else {
        if (tx.status === 'COMPLETED') spent += tx.amount
      }
    }
    return { charged, spent, profit: charged - spent, outstanding, refunded }
  }, [transactions])

  const feeSummary = useMemo(() => {
    const myId = session?.user?.id
    // Include unassigned students I uploaded as an admin. An agent's list
    // remains limited to current assignments, even if they uploaded a record.
    const isAdmin = session?.user?.role === 'ADMIN' || session?.user?.role === 'OWNER'
    const relevantStudents = myId ? students.filter(s =>
      s.agentId === myId || (isAdmin && s.agentId === null && s.createdById === myId)
    ) : []

    const chargedByStudent: Record<string, number> = {}
    for (const tx of allMyTransactions) {
      if (tx.type === 'INCOME' && tx.status === 'COMPLETED') {
        chargedByStudent[tx.studentId] = (chargedByStudent[tx.studentId] || 0) + tx.amount
      }
    }
    let totalFee = 0, totalCosting = 0, totalDue = 0, hasFeeData = false
    for (const s of relevantStudents) {
      if (typeof s.totalFee === 'number') {
        hasFeeData = true
        totalFee += s.totalFee
        totalDue += Math.max(s.totalFee - (chargedByStudent[s.id] || 0), 0)
      }
      if (typeof s.myCosting === 'number') totalCosting += s.myCosting
    }
    return { totalFee, totalCosting, totalDue, margin: totalFee - totalCosting, hasFeeData }
  }, [students, allMyTransactions, session])

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, { income: number; expense: number }> = {}
    for (const tx of transactions) {
      if (tx.status === 'REFUNDED') continue
      if (!map[tx.category]) map[tx.category] = { income: 0, expense: 0 }
      if (tx.type === 'INCOME') map[tx.category].income += tx.amount
      else map[tx.category].expense += tx.amount
    }
    return TRANSACTION_CATEGORIES
      .map((c) => ({ key: c, ...map[c] }))
      .filter((c) => (c.income || 0) > 0 || (c.expense || 0) > 0)
      .sort((a, b) => (b.income + b.expense) - (a.income + a.expense))
  }, [transactions])

  const perStudent = useMemo(() => {
    const map: Record<string, { student: any; canViewStudent: boolean; charged: number; spent: number }> = {}
    for (const tx of transactions) {
      if (!tx.student) continue
      if (!map[tx.studentId]) map[tx.studentId] = { student: tx.student, canViewStudent: tx.canViewStudent, charged: 0, spent: 0 }
      if (tx.status !== 'COMPLETED') continue
      if (tx.type === 'INCOME') map[tx.studentId].charged += tx.amount
      else map[tx.studentId].spent += tx.amount
    }
    return Object.values(map).sort((a, b) => (b.charged - b.spent) - (a.charged - a.spent))
  }, [transactions])

  const getStatusBadge = (status: string) => ({
    COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border-emerald-200',
    PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 border-amber-200',
    REFUNDED: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-400 border-slate-200',
  }[status] || 'bg-muted text-foreground border-border')

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{t('finance.myFinanceTitle')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('finance.subtitleMine')}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasFeature('finance_export') && (
            <button onClick={exportExcel} className="px-4 py-2.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 rounded-xl hover:bg-emerald-100 transition flex items-center gap-2 text-sm font-medium">
              <Download className="w-4 h-4" /> {t('finance.exportExcel')}
            </button>
          )}
          <button onClick={() => setShowAddModal(true)} className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition flex items-center gap-2 text-sm font-medium shadow-sm shadow-indigo-500/20">
            <Plus className="w-4 h-4" /> {t('finance.addTransaction')}
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('finance.totalCharged')}</p>
              <p className="text-2xl font-bold text-foreground mt-1.5">{formatMoney(totals.charged)}</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-sm">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('finance.totalSpent')}</p>
              <p className="text-2xl font-bold text-foreground mt-1.5">{formatMoney(totals.spent)}</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center shadow-sm">
              <TrendingDown className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('finance.netProfit')}</p>
              <p className={`text-2xl font-bold mt-1.5 ${totals.profit >= 0 ? 'text-foreground' : 'text-rose-600'}`}>{formatMoney(totals.profit)}</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-sm">
              <Wallet className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('finance.outstanding')}</p>
              <p className="text-2xl font-bold text-amber-600 mt-1.5">{formatMoney(totals.outstanding)}</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-sm">
              <Clock3 className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
      </div>

      {feeSummary.hasFeeData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('finance.totalFee')}</p>
            <p className="text-2xl font-bold text-foreground mt-1.5">{formatMoney(feeSummary.totalFee)}</p>
          </div>
          <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('finance.myCosting')}</p>
            <p className="text-2xl font-bold text-foreground mt-1.5">{formatMoney(feeSummary.totalCosting)}</p>
          </div>
          <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('finance.myMargin')}</p>
            <p className={`text-2xl font-bold mt-1.5 ${feeSummary.margin >= 0 ? 'text-foreground' : 'text-rose-600'}`}>{formatMoney(feeSummary.margin)}</p>
          </div>
          <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('finance.amountDue')}</p>
            {feeSummary.totalDue <= 0 ? (
              <p className="text-xl font-bold text-emerald-600 mt-1.5">{t('finance.fullyPaid')}</p>
            ) : (
              <p className="text-2xl font-bold text-rose-600 mt-1.5">{formatMoney(feeSummary.totalDue)}</p>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-5 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('finance.searchLabel')}</label>
          <div className="relative mt-1.5">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('finance.search')} className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground" />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('finance.dateRange')}</label>
          <select value={rangePreset} onChange={(e) => setRangePreset(e.target.value)} className="mt-1.5 px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground">
            <option value="ALL">{t('finance.allTime')}</option>
            <option value="THIS_MONTH">{t('finance.thisMonth')}</option>
            <option value="LAST_MONTH">{t('finance.lastMonth')}</option>
            <option value="THIS_YEAR">{t('finance.thisYear')}</option>
            <option value="CUSTOM">{t('finance.custom')}</option>
          </select>
        </div>
        {rangePreset === 'CUSTOM' && (
          <>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('finance.from')}</label>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="mt-1.5 px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('finance.to')}</label>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="mt-1.5 px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground" />
            </div>
          </>
        )}
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('finance.filterByType')}</label>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="mt-1.5 px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground">
            <option value="">{t('finance.allTypes')}</option>
            <option value="INCOME">{t('finance.income')}</option>
            <option value="EXPENSE">{t('finance.expense')}</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('finance.filterByStatus')}</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="mt-1.5 px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground">
            <option value="">{t('finance.allStatuses')}</option>
            <option value="COMPLETED">{t('finance.stCompleted')}</option>
            <option value="PENDING">{t('finance.stPending')}</option>
            <option value="REFUNDED">{t('finance.stRefunded')}</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category breakdown */}
        <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-6">
          <h3 className="text-base font-semibold text-foreground mb-4">{t('finance.categoryBreakdown')}</h3>
          {categoryBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('finance.noTransactions')}</p>
          ) : (
            <div className="space-y-3">
              {categoryBreakdown.map((c) => {
                const max = Math.max(...categoryBreakdown.map((x) => Math.max(x.income, x.expense)), 1)
                return (
                  <div key={c.key}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-foreground">{t(`finance.${CATEGORY_KEYS[c.key]}`)}</span>
                      <span className="text-muted-foreground">{formatMoney(c.income)} / {formatMoney(c.expense)}</span>
                    </div>
                    <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-muted">
                      <div className="bg-emerald-500" style={{ width: `${(c.income / max) * 50}%` }} />
                      <div className="bg-rose-500" style={{ width: `${(c.expense / max) * 50}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Per-student breakdown */}
        <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-6">
          <h3 className="text-base font-semibold text-foreground mb-4">{t('finance.perStudentBreakdown')}</h3>
          {perStudent.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('finance.noTransactions')}</p>
          ) : (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {perStudent.map(row => {
                const rowClass = "flex items-center justify-between px-3 py-2.5 rounded-xl"
                const content = (
                  <>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{row.student.fullName}</p>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{row.student.status}</span>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className={`text-sm font-bold ${row.charged - row.spent >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatMoney(row.charged - row.spent)}</p>
                      <p className="text-[11px] text-muted-foreground">{formatMoney(row.charged)} / {formatMoney(row.spent)}</p>
                    </div>
                  </>
                )
                return row.canViewStudent ? (
                  <Link key={row.student.id} href={`/dashboard/students/${row.student.id}/finance`} className={rowClass + ' hover:bg-muted transition-colors'}>{content}</Link>
                ) : (
                  <div key={row.student.id} className={rowClass}>{content}</div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Transactions table */}
      <div className="bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden">
        <div className="px-6 py-5 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">{t('finance.allTransactions')}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('finance.date')}</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('finance.student')}</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('finance.category')}</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('finance.amount')}</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('finance.status')}</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-muted-foreground text-sm">{t('common.loading')}</td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-muted-foreground text-sm">{t('finance.noTransactions')}</td></tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-muted/60 transition-colors">
                    <td className="px-6 py-4 text-sm text-muted-foreground">{formatDate(tx.transactionDate)}</td>
                    <td className="px-6 py-4 text-sm">
                      {tx.canViewStudent ? (
                        <Link href={`/dashboard/students/${tx.studentId}/finance`} className="font-medium text-indigo-600 hover:text-indigo-700">{tx.student?.fullName}</Link>
                      ) : (
                        <span>{tx.student?.fullName}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{t(`finance.${CATEGORY_KEYS[tx.category]}`)}</td>
                    <td className={`px-6 py-4 text-sm font-semibold ${tx.type === 'INCOME' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {tx.type === 'INCOME' ? '+' : '-'}{formatMoney(tx.amount, tx.currency)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider border ${getStatusBadge(tx.status)}`}>
                        {t(`finance.${STATUS_KEYS[tx.status]}`)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        {tx.canViewStudent && (
                          <Link href={`/dashboard/students/${tx.studentId}/finance`} className="text-indigo-600 hover:text-indigo-700 p-1.5 rounded-lg hover:bg-indigo-50 transition-colors inline-flex">
                            <Eye className="w-4 h-4" />
                          </Link>
                        )}
                        {tx.type === 'INCOME' && hasFeature('finance_receipt') && (
                          <Link href={`/dashboard/students/${tx.studentId}/finance/receipt/${tx.id}`} target="_blank" className="text-slate-500 hover:text-slate-700 p-1.5 rounded-lg hover:bg-muted transition-colors inline-flex" title={t('finance.receiptTitle')}>
                            <Receipt className="w-4 h-4" />
                          </Link>
                        )}
                        <button onClick={() => deleteTransaction(tx.id)} className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition-colors inline-flex">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <TransactionFormModal
          students={students}
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); fetchTransactions() }}
        />
      )}
    </div>
  )
}
