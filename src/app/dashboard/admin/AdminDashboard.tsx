'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import {
  Users, UserCheck,
  TrendingUp, FileText, Eye, Globe, ChevronDown, ChevronUp, HardDriveDownload,
  ListTodo, Clock
} from 'lucide-react'
import { useLanguage } from '@/src/lib/i18n/LanguageContext'
import { useFeatures } from '@/src/lib/FeaturesContext'

interface AdminDashboardProps {
  stats: {
    agents: number
    students: number
    pending: number
    approved: number
    rejected: number
  }
  recentStudents: any[]
  canExportBackup: boolean
}

interface DonutSlice {
  key: string
  label: string
  value: number
  color: string
  href: string
}

function StatusDonut({ slices, total }: { slices: DonutSlice[]; total: number }) {
  const router = useRouter()
  const { t } = useLanguage()
  const [hovered, setHovered] = useState<string | null>(null)

  const size = 200
  const r = 78
  const stroke = 30
  const circumference = 2 * Math.PI * r
  let cumulative = 0

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
        {t('dashboard.noStudentsYet')}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center shrink-0">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
          {slices.filter(s => s.value > 0).map((s) => {
            const fraction = s.value / total
            const dash = fraction * circumference
            const offset = -cumulative
            cumulative += dash
            const isHovered = hovered === s.key
            return (
              <circle
                key={s.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={isHovered ? stroke + 6 : stroke}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={offset}
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() => setHovered(s.key)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => router.push(s.href)}
              >
                <title>{s.label}: {s.value}</title>
              </circle>
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <p className="text-3xl font-bold text-foreground">
            {hovered ? slices.find(s => s.key === hovered)?.value : total}
          </p>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            {hovered ? slices.find(s => s.key === hovered)?.label : t('dashboard.total')}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function AdminDashboard({ stats, recentStudents, canExportBackup }: AdminDashboardProps) {
  const { t, formatDate, formatDateTime } = useLanguage()
  const { has: hasFeature } = useFeatures()
  const { data: session } = useSession()
  const isOwner = session?.user?.role === 'OWNER'
  const isAdmin = session?.user?.role === 'ADMIN'
  const [portalChanges, setPortalChanges] = useState<any[]>([])
  const [portalChangesLoading, setPortalChangesLoading] = useState(true)
  const [hasPortalAccess, setHasPortalAccess] = useState(false)
  const [portalChangesCollapsed, setPortalChangesCollapsed] = useState(false)
  const [myTasks, setMyTasks] = useState<any[]>([])
  const [myTasksLoading, setMyTasksLoading] = useState(true)
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!isAdmin) { setMyTasksLoading(false); return }
    fetch('/api/tasks', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setMyTasks(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setMyTasksLoading(false))
  }, [isAdmin])

  async function updateMyTaskStatus(id: string, status: string) {
    if (status === 'COMPLETED' && !confirm(t('tasks.markCompleteConfirm'))) return
    setTaskBusyId(id)
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        const updated = await res.json()
        setMyTasks((prev) => prev.map((task) => (task.id === id ? updated : task)))
      }
    } finally {
      setTaskBusyId(null)
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem('portalStatusChangesCollapsed')
    if (stored !== null) setPortalChangesCollapsed(stored === 'true')
  }, [])

  function togglePortalChangesCollapsed() {
    setPortalChangesCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('portalStatusChangesCollapsed', String(next))
      return next
    })
  }

  useEffect(() => {
    fetch('/api/portals/changes', { credentials: 'include' })
      .then((r) => {
        setHasPortalAccess(r.ok)
        return r.ok ? r.json() : []
      })
      .then((data) => setPortalChanges(Array.isArray(data) ? data.slice(0, 8) : []))
      .catch(() => {})
      .finally(() => setPortalChangesLoading(false))
  }, [])

  const topCards = [
    { label: t('dashboard.totalAgents'), value: stats.agents, icon: Users, color: 'from-indigo-500 to-indigo-600', href: '/dashboard/agents' },
    { label: t('dashboard.totalStudents'), value: stats.students, icon: UserCheck, color: 'from-violet-500 to-violet-600', href: '/dashboard/students' },
  ]

  const slices: DonutSlice[] = [
    { key: 'PENDING', label: t('dashboard.pendingReview'), value: stats.pending, color: '#f59e0b', href: '/dashboard/students?status=PENDING' },
    { key: 'APPROVED', label: t('dashboard.approved'), value: stats.approved, color: '#10b981', href: '/dashboard/students?status=APPROVED' },
    { key: 'REJECTED', label: t('dashboard.rejected'), value: stats.rejected, color: '#f43f5e', href: '/dashboard/students?status=REJECTED' },
  ]

  const getStatusBadge = (status: string) => {
    const styles = {
      PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 border-amber-200',
      APPROVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border-emerald-200',
      REJECTED: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400 border-rose-200'
    }
    return styles[status as keyof typeof styles] || 'bg-muted text-foreground border-border'
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      PENDING: t('common.statusPending'),
      APPROVED: t('common.statusApproved'),
      REJECTED: t('common.statusRejected'),
    }
    return labels[status] || status
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{t('dashboard.adminTitle')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('dashboard.overview')}</p>
        </div>
        {canExportBackup && hasFeature('backup_export') && (
          <a
            href="/api/backup/export"
            className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition flex items-center gap-2 text-sm font-medium shadow-sm shadow-indigo-500/20 shrink-0"
            title={t('dashboard.downloadBackupHint')}
          >
            <HardDriveDownload className="w-4 h-4" />
            {t('dashboard.downloadBackup')}
          </a>
        )}
      </div>

      {isAdmin && !myTasksLoading && (
        <div className="rounded-2xl border-2 border-indigo-300 dark:border-indigo-500/40 bg-indigo-50/60 dark:bg-indigo-500/10 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-indigo-200 dark:border-indigo-500/30 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ListTodo className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <div>
                <h2 className="text-base font-semibold text-foreground">{t('tasks.myTasksTitle')}</h2>
                <p className="text-xs text-muted-foreground">{t('tasks.myTasksHint')}</p>
              </div>
              {myTasks.filter((task) => task.status !== 'COMPLETED').length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-indigo-600 text-white text-xs font-bold">
                  {myTasks.filter((task) => task.status !== 'COMPLETED').length}
                </span>
              )}
            </div>
            <Link href="/dashboard/tasks" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
              {t('tasks.viewAllTasks')}
            </Link>
          </div>

          {myTasks.filter((task) => task.status !== 'COMPLETED').length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">{t('tasks.myTasksAllDone')}</div>
          ) : (
            <div className="divide-y divide-indigo-200/60 dark:divide-indigo-500/20">
              {myTasks.filter((task) => task.status !== 'COMPLETED').slice(0, 5).map((task) => {
                const overdue = new Date(task.dueAt) < new Date()
                return (
                  <div key={task.id} className="px-6 py-3.5 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                      <p className={`text-xs mt-0.5 flex items-center gap-1 ${overdue ? 'text-rose-600 font-semibold' : 'text-muted-foreground'}`}>
                        <Clock className="w-3 h-3" />
                        {overdue ? t('tasks.statusOverdue') + ' — ' : ''}{formatDateTime(task.dueAt)}
                      </p>
                    </div>
                    <select
                      value={task.status}
                      disabled={taskBusyId === task.id}
                      onChange={(e) => updateMyTaskStatus(task.id, e.target.value)}
                      className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50 shrink-0"
                    >
                      <option value="PENDING">{t('tasks.statusPending')}</option>
                      <option value="STARTED">{t('tasks.statusStarted')}</option>
                      <option value="COMPLETED">{t('tasks.statusCompleted')}</option>
                    </select>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {hasPortalAccess && (
        <div className="bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden">
          <button
            onClick={togglePortalChangesCollapsed}
            className="w-full px-6 py-5 border-b border-border flex items-center justify-between text-left hover:bg-muted/40 transition-colors"
            aria-expanded={!portalChangesCollapsed}
          >
            <div>
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-600" /> {t('dashboard.portalStatusChanges')}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">{t('dashboard.portalStatusChangesHint')}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isOwner && (
                <Link
                  href="/dashboard/portals"
                  onClick={(e) => e.stopPropagation()}
                  className="text-indigo-600 hover:text-indigo-700 text-sm font-medium flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                  {t('dashboard.viewAll')} <TrendingUp className="w-4 h-4" />
                </Link>
              )}
              {portalChangesCollapsed ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </button>
          {!portalChangesCollapsed && (
            portalChangesLoading ? (
              <div className="px-6 py-10 text-center text-muted-foreground text-sm">{t('common.loading')}</div>
            ) : portalChanges.length === 0 ? (
              <div className="px-6 py-10 text-center text-muted-foreground text-sm">{t('portals.noChangesYet')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('dashboard.date')}</th>
                      <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('dashboard.student')}</th>
                      <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('portals.allPortals')}</th>
                      <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('portals.changeField')}</th>
                      <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('portals.oldValue')}</th>
                      <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('portals.newValue')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {portalChanges.map((c) => (
                      <tr key={c.id} className="hover:bg-muted/60 transition-colors">
                        <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">{formatDateTime(c.detectedAt)}</td>
                        <td className="px-6 py-4 text-sm font-medium text-foreground">{c.passportName || c.passportNo || '-'}</td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">{c.portal?.name}</td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">{c.field}</td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">{c.oldValue ?? '-'}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-emerald-600">{c.newValue ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="flex flex-col gap-5">
          {topCards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="bg-card rounded-2xl shadow-sm border border-border/60 p-5 hover:shadow-md hover:border-border transition-all cursor-pointer block"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{card.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-1.5">{card.value}</p>
                </div>
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center shadow-sm`}>
                  <card.icon className="w-5 h-5 text-white" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="lg:col-span-2 bg-card rounded-2xl shadow-sm border border-border/60 p-6 flex flex-col sm:flex-row items-center gap-6">
          <StatusDonut slices={slices} total={stats.pending + stats.approved + stats.rejected} />
          <div className="flex-1 w-full space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('dashboard.applicationStatus')}</p>
            {slices.map((s) => (
              <Link
                key={s.key}
                href={s.href}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-muted transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-sm font-medium text-foreground group-hover:text-foreground">{s.label}</span>
                </div>
                <span className="text-sm font-bold text-foreground">{s.value}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden">
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">{t('dashboard.recentSubmissions')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t('dashboard.latestApplications')}</p>
          </div>
          <Link href="/dashboard/students" className="text-indigo-600 hover:text-indigo-700 text-sm font-medium flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
            {t('dashboard.viewAll')} <TrendingUp className="w-4 h-4" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('dashboard.student')}</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('dashboard.agent')}</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('common.status')}</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('dashboard.documents')}</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('dashboard.date')}</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-muted-foreground text-sm">
                    {t('dashboard.noRecentSubmissions')}
                  </td>
                </tr>
              ) : (
                recentStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-muted/60 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold text-sm text-foreground">{student.fullName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{student.mainEmail}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{student.agent?.name ?? t('students.unassigned')}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider border ${getStatusBadge(student.status)}`}>
                        {getStatusLabel(student.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        {student.documents.length}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {formatDate(student.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <Link href={`/dashboard/students/${student.id}`} className="text-indigo-600 hover:text-indigo-700 p-1.5 rounded-lg hover:bg-indigo-50 transition-colors inline-flex">
                        <Eye className="w-5 h-5" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}