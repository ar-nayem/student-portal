'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Search, Filter, Download, Eye, FileText, Trash2,
  CheckCircle, XCircle, Clock, FileWarning, UserCheck, Link2, Copy, Check, RefreshCw, X, Loader2
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/src/lib/i18n/LanguageContext'
import { useFeatures } from '@/src/lib/FeaturesContext'

export default function StudentsPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-muted-foreground text-sm">Loading...</div>}>
      <StudentsPageInner />
    </Suspense>
  )
}

function StudentsPageInner() {
  const { data: session } = useSession()
  const { t, formatDate } = useLanguage()
  const { has: hasFeature } = useFeatures()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [students, setStudents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [status, setStatus] = useState(searchParams.get('status') || '')
  const [agentId, setAgentId] = useState(searchParams.get('agentId') || '')
  const [adminId, setAdminId] = useState(searchParams.get('adminId') || '')
  const [agents, setAgents] = useState<any[]>([])
  const [admins, setAdmins] = useState<any[]>([])
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [intakeCode, setIntakeCode] = useState<string | null>(null)
  const [intakeLoading, setIntakeLoading] = useState(false)
  const [intakeRegenerating, setIntakeRegenerating] = useState(false)
  const [intakeCopied, setIntakeCopied] = useState(false)
  const isAdmin = session?.user?.role === 'ADMIN' || session?.user?.role === 'OWNER'

  useEffect(() => {
    if (session?.user?.role === 'ADMIN' || session?.user?.role === 'OWNER') {
      fetch('/api/users')
        .then(res => res.json())
        .then(data => {
          setAgents(data.filter((u: any) => u.role === 'AGENT'))
          setAdmins(data.filter((u: any) => u.role === 'ADMIN' || u.role === 'OWNER'))
        })
    }
  }, [session])

  useEffect(() => {
    fetchStudents()
  }, [search, status, agentId, adminId, session])

  async function fetchStudents() {
    if (!session?.user) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (status) params.set('status', status)
      if (isAdmin && (agentId || adminId)) params.set('agentId', agentId || adminId)

      const res = await fetch(`/api/students?${params}`)
      const data = await res.json()
      setStudents(data)
    } catch {
      toast.error(t('students.failedLoadStudents'))
    } finally {
      setLoading(false)
    }
  }

  function openShareModal() {
    setShareModalOpen(true)
    if (!intakeCode) fetchIntakeCode()
  }

  async function fetchIntakeCode() {
    setIntakeLoading(true)
    try {
      const res = await fetch('/api/profile/intake-link', { credentials: 'include' })
      if (res.ok) setIntakeCode((await res.json()).code)
      else toast.error(t('intake.failedLoadLink'))
    } catch {
      toast.error(t('intake.failedLoadLink'))
    } finally {
      setIntakeLoading(false)
    }
  }

  async function regenerateIntakeCode() {
    if (!confirm(t('intake.regenerateConfirm'))) return
    setIntakeRegenerating(true)
    try {
      const res = await fetch('/api/profile/intake-link', { method: 'POST', credentials: 'include' })
      if (res.ok) {
        setIntakeCode((await res.json()).code)
        toast.success(t('intake.regenerated'))
      } else {
        toast.error(t('intake.failedLoadLink'))
      }
    } catch {
      toast.error(t('intake.failedLoadLink'))
    } finally {
      setIntakeRegenerating(false)
    }
  }

  function copyIntakeLink() {
    if (!intakeCode) return
    const url = `${window.location.origin}/apply/${intakeCode}`
    navigator.clipboard.writeText(url).then(() => {
      setIntakeCopied(true)
      setTimeout(() => setIntakeCopied(false), 2000)
    })
  }

  async function exportToExcel() {
    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (agentId) params.set('agentId', agentId)
      params.set('format', 'xlsx')
      
      const res = await fetch(`/api/export?${params}`)
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `students-export-${Date.now()}.xlsx`
      a.click()
      toast.success(t('students.exportDownloaded'))
    } catch {
      toast.error(t('students.exportFailed'))
    }
  }

  async function batchDownload() {
    if (selectedStudents.length === 0) {
      toast.error(t('students.selectStudentsFirst'))
      return
    }
    try {
      const res = await fetch('/api/documents/batch-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ studentIds: selectedStudents })
      })
      if (!res.ok) {
        // Was previously falling through to res.blob() even on 401/500 —
        // downloading the JSON error body as a fake, corrupt ".zip" while
        // still reporting success.
        const data = await res.json().catch(() => null)
        toast.error(data?.error || t('students.batchDownloadFailed'))
        return
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `documents-batch-${Date.now()}.zip`
      a.click()
      window.URL.revokeObjectURL(url)
      toast.success(t('students.batchDownloadStarted'))
    } catch {
      toast.error(t('students.batchDownloadFailed'))
    }
  }

  async function batchDelete() {
    if (selectedStudents.length === 0) {
      toast.error(t('students.selectStudentsFirst'))
      return
    }
    if (!confirm(`${t('students.batchDeleteConfirm')} (${selectedStudents.length})`)) return

    try {
      const res = await fetch('/api/students', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ studentIds: selectedStudents })
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      toast.success(`${t('students.batchDeleteSuccess')} (${data.deletedCount})`)
      setSelectedStudents([])
      fetchStudents()
    } catch {
      toast.error(t('students.batchDeleteFailed'))
    }
  }

  const getStatusBadge = (s: string) => {
    const styles: Record<string, string> = {
      PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 border-amber-200',
      APPROVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border-emerald-200',
      REJECTED: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400 border-rose-200',
      NEEDS_REVISION: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300 border-orange-200',
    }
    return styles[s] || 'bg-muted text-foreground border-border'
  }

  const getStatusLabel = (s: string) => {
    const labels: Record<string, string> = {
      PENDING: t('common.statusPending'),
      APPROVED: t('common.statusApproved'),
      REJECTED: t('common.statusRejected'),
      NEEDS_REVISION: t('students.needsRevision'),
    }
    return labels[s] || s
  }

  const getStatusIcon = (s: string) => {
    if (s === 'APPROVED') return <CheckCircle className="w-3.5 h-3.5" />
    if (s === 'REJECTED') return <XCircle className="w-3.5 h-3.5" />
    if (s === 'NEEDS_REVISION') return <FileWarning className="w-3.5 h-3.5" />
    return <Clock className="w-3.5 h-3.5" />
  }

  const toggleSelection = (id: string) => {
    setSelectedStudents(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{isAdmin ? t('students.allStudentsTitle') : t('students.myStudentsTitle')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('students.manageAndReview')}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasFeature('intake_link') && (
            <button
              onClick={openShareModal}
              className="bg-card border border-border text-foreground px-4 py-2.5 rounded-xl font-medium hover:bg-muted transition flex items-center gap-2 text-sm shadow-sm"
            >
              <Link2 className="w-4 h-4" />
              {t('intake.shareLinkButton')}
            </button>
          )}
          {hasFeature('student_create') && (
            <Link
              href="/dashboard/students/new"
              className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition flex items-center gap-2 text-sm shadow-sm shadow-indigo-500/20"
            >
              <UserCheck className="w-4 h-4" />
              {t('nav.addStudent')}
            </Link>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-5">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{t('common.search')}</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={t('students.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm bg-muted/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{t('common.status')}</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-muted/50"
            >
              <option value="">{t('students.allStatus')}</option>
              <option value="PENDING">{t('common.statusPending')}</option>
              <option value="APPROVED">{t('common.statusApproved')}</option>
              <option value="REJECTED">{t('common.statusRejected')}</option>
              <option value="NEEDS_REVISION">{t('students.needsRevision')}</option>
            </select>
          </div>

          {isAdmin && (
            <div>
              <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{t('dashboard.agent')}</label>
              <select
                value={agentId}
                onChange={(e) => { setAgentId(e.target.value); setAdminId('') }}
                className="px-3 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-muted/50"
              >
                <option value="">{t('students.allAgents')}</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </select>
            </div>
          )}

          {isAdmin && (
            <div>
              <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{t('students.filterByAdmin')}</label>
              <select
                value={adminId}
                onChange={(e) => { setAdminId(e.target.value); setAgentId('') }}
                className="px-3 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-muted/50"
              >
                <option value="">{t('students.allAdmins')}</option>
                {admins.map((admin) => (
                  <option key={admin.id} value={admin.id}>{admin.name}</option>
                ))}
              </select>
            </div>
          )}

          {isAdmin && (
            <>
              {hasFeature('data_export') && (
                <button
                  onClick={exportToExcel}
                  className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition flex items-center gap-2 text-sm font-medium shadow-sm shadow-emerald-500/20"
                >
                  <Download className="w-4 h-4" />
                  {t('students.exportExcel')}
                </button>
              )}
              {hasFeature('document_batch_download') && (
                <button
                  onClick={batchDownload}
                  disabled={selectedStudents.length === 0}
                  className="px-4 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition flex items-center gap-2 text-sm font-medium disabled:opacity-50 shadow-sm shadow-violet-500/20"
                >
                  <Download className="w-4 h-4" />
                  {t('students.batchDownload')} ({selectedStudents.length})
                </button>
              )}
              <button
                onClick={batchDelete}
                disabled={selectedStudents.length === 0}
                className="px-4 py-2.5 bg-rose-600 text-white rounded-xl hover:bg-rose-700 transition flex items-center gap-2 text-sm font-medium disabled:opacity-50 shadow-sm shadow-rose-500/20"
              >
                <Trash2 className="w-4 h-4" />
                {t('students.batchDelete')} ({selectedStudents.length})
              </button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground text-sm">{t('common.loading')}</div>
        ) : students.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground text-sm">{t('students.noStudentsFound')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  {isAdmin && (
                    <th className="px-4 py-3.5">
                      <input
                        type="checkbox"
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedStudents(students.map(s => s.id))
                          } else {
                            setSelectedStudents([])
                          }
                        }}
                        className="rounded border-border"
                      />
                    </th>
                  )}
                  <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('students.serialNo')}</th>
                  <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('dashboard.student')}</th>
                  {isAdmin && <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('dashboard.agent')}</th>}
                  <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('students.program')}</th>
                  <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('common.status')}</th>
                  <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('dashboard.documents')}</th>
                  <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('dashboard.date')}</th>
                  <th className="px-6 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {students.map((student) => (
                  <tr key={student.id} className="hover:bg-muted/60 transition-colors">
                    {isAdmin && (
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedStudents.includes(student.id)}
                          onChange={() => toggleSelection(student.id)}
                          className="rounded border-border"
                        />
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <span className="text-sm font-semibold text-indigo-600 font-mono">{student.serialNumber || '-'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold text-sm text-foreground">{student.fullName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{student.mainEmail}</p>
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 text-sm text-muted-foreground">{student.agent?.name}</td>
                    )}
                    <td className="px-6 py-4 text-sm text-muted-foreground">{student.programApplied || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider border ${getStatusBadge(student.status)}`}>
                        {getStatusIcon(student.status)}
                        {getStatusLabel(student.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        {student.documents?.length || 0}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {shareModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShareModalOpen(false)}>
          <div className="bg-card rounded-2xl shadow-xl border border-border/60 w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-indigo-600" />
                <h3 className="text-lg font-semibold text-foreground">{t('intake.shareLinkModalTitle')}</h3>
              </div>
              <button onClick={() => setShareModalOpen(false)} className="p-1 text-muted-foreground hover:text-foreground rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{t('intake.shareLinkModalHint')}</p>

            {intakeLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  readOnly
                  value={intakeCode ? `${typeof window !== 'undefined' ? window.location.origin : ''}/apply/${intakeCode}` : ''}
                  placeholder={t('common.loading')}
                  className="flex-1 min-w-[220px] px-3 py-2 border border-border rounded-xl bg-muted text-sm text-foreground"
                />
                <button
                  onClick={copyIntakeLink}
                  disabled={!intakeCode}
                  className="px-3 py-2 border border-border rounded-xl text-sm font-medium hover:bg-muted transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {intakeCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  {intakeCopied ? t('agentsPage.copied') : t('agentsPage.copy')}
                </button>
                <button
                  onClick={regenerateIntakeCode}
                  disabled={intakeRegenerating || !intakeCode}
                  className="px-3 py-2 border border-border rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {intakeRegenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {t('agentsPage.regenerate')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}