'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Plus, FileText, Link2, Trash2, Users, History, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/src/lib/i18n/LanguageContext'

interface ResourceSummary {
  id: string
  title: string
  description: string | null
  kind: 'FILE' | 'LINK'
  originalName: string | null
  mimeType: string | null
  size: number | null
  url: string | null
  createdAt: string
  createdBy: { name: string }
  _count: { grants: number; accessLogs: number }
}

interface AdminOption {
  id: string
  name: string
  email: string
}

interface AccessLogEntry {
  id: string
  accessedAt: string
  admin: { name: string; email: string }
}

interface GrantEntry {
  adminId: string
  grantedAt: string
  admin: { name: string; email: string }
  grantedBy: { name: string }
}

async function errorMessage(res: Response, fallback: string) {
  try {
    const data = await res.json()
    if (typeof data?.error === 'string') return data.error
  } catch {}
  return fallback
}

export default function OwnerResources() {
  const { t, formatDateTime } = useLanguage()

  const [resources, setResources] = useState<ResourceSummary[]>([])
  const [admins, setAdmins] = useState<AdminOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [kind, setKind] = useState<'FILE' | 'LINK'>('FILE')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const expandedRef = useRef<string | null>(null)
  const [logs, setLogs] = useState<AccessLogEntry[]>([])
  const [grants, setGrants] = useState<GrantEntry[]>([])
  const [selectedAdminId, setSelectedAdminId] = useState('')

  useEffect(() => {
    loadAll()
  }, [])

  // `silent` refreshes the list in place; without it the whole page swaps to a
  // spinner, which would also collapse an open access panel.
  async function loadAll(silent = false) {
    if (!silent) setLoading(true)
    try {
      const [rRes, aRes] = await Promise.all([
        fetch('/api/shared-resources'),
        fetch('/api/shared-resources/admins'),
      ])
      if (!rRes.ok) throw new Error(await errorMessage(rRes, t('resources.loadFailed')))
      if (!aRes.ok) throw new Error(await errorMessage(aRes, t('resources.loadFailed')))
      setResources(await rRes.json())
      setAdmins(await aRes.json())
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : t('resources.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  async function createResource(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    if (kind === 'LINK' && !url.trim()) return
    if (kind === 'FILE' && !file) return

    setCreating(true)
    try {
      const formData = new FormData()
      formData.set('kind', kind)
      formData.set('title', title.trim())
      formData.set('description', description.trim())
      if (kind === 'LINK') formData.set('url', url.trim())
      else if (file) formData.set('file', file)

      const res = await fetch('/api/shared-resources', { method: 'POST', body: formData })
      if (!res.ok) throw new Error(await errorMessage(res, t('resources.createFailed')))

      setTitle('')
      setDescription('')
      setUrl('')
      setFile(null)
      setShowCreate(false)
      await loadAll(true)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : t('resources.createFailed'))
    } finally {
      setCreating(false)
    }
  }

  async function deleteResource(id: string) {
    if (!confirm(t('resources.deleteConfirm'))) return
    try {
      const res = await fetch(`/api/shared-resources/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await errorMessage(res, t('resources.loadFailed')))
      if (expandedRef.current === id) {
        expandedRef.current = null
        setExpandedId(null)
      }
      await loadAll(true)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : t('resources.loadFailed'))
    }
  }

  // Ignores a response that arrives after the owner has moved to another
  // panel, so one resource's grants can never show under another.
  async function refreshPanel(id: string) {
    try {
      const res = await fetch(`/api/shared-resources/${id}/access-log`)
      if (!res.ok) throw new Error(await errorMessage(res, t('resources.loadFailed')))
      const data = await res.json()
      if (expandedRef.current !== id) return
      setLogs(data.logs)
      setGrants(data.grants)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : t('resources.loadFailed'))
    }
  }

  async function toggleExpand(id: string) {
    if (expandedRef.current === id) {
      expandedRef.current = null
      setExpandedId(null)
      return
    }
    expandedRef.current = id
    setExpandedId(id)
    setSelectedAdminId('')
    setLogs([])
    setGrants([])
    await refreshPanel(id)
  }

  async function grantAdmin(resourceId: string) {
    if (!selectedAdminId) return
    try {
      const res = await fetch(`/api/shared-resources/${resourceId}/grants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: selectedAdminId }),
      })
      if (!res.ok) throw new Error(await errorMessage(res, t('resources.loadFailed')))
      setSelectedAdminId('')
      await Promise.all([refreshPanel(resourceId), loadAll(true)])
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : t('resources.loadFailed'))
    }
  }

  async function revokeAdmin(resourceId: string, adminId: string) {
    try {
      const res = await fetch(`/api/shared-resources/${resourceId}/grants?adminId=${encodeURIComponent(adminId)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await errorMessage(res, t('resources.loadFailed')))
      await Promise.all([refreshPanel(resourceId), loadAll(true)])
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : t('resources.loadFailed'))
    }
  }

  if (loading) return <div className="p-8 text-center">{t('common.loading')}</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('resources.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('resources.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> {t('resources.newResource')}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={createResource} className="bg-card rounded-2xl shadow-sm border border-border/60 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setKind('FILE')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${kind === 'FILE' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-border text-muted-foreground'}`}>
              <FileText className="w-3.5 h-3.5 inline mr-1.5" />{t('resources.kindFile')}
            </button>
            <button type="button" onClick={() => setKind('LINK')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${kind === 'LINK' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-border text-muted-foreground'}`}>
              <Link2 className="w-3.5 h-3.5 inline mr-1.5" />{t('resources.kindLink')}
            </button>
          </div>

          <input required value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={t('resources.titlePlaceholder')}
            className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background outline-none focus:ring-2 focus:ring-indigo-500" />

          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            placeholder={t('resources.descriptionPlaceholder')}
            className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />

          {kind === 'LINK' ? (
            <input required type="url" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder={t('resources.urlPlaceholder')}
              className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background outline-none focus:ring-2 focus:ring-indigo-500" />
          ) : (
            <label className="px-3.5 py-2 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:bg-muted transition inline-flex items-center gap-2 cursor-pointer">
              {t('resources.chooseFile')}
              <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              {file && <span className="text-foreground">{file.name}</span>}
            </label>
          )}

          <div className="flex items-center gap-2">
            <button type="submit" disabled={creating}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition inline-flex items-center gap-2 disabled:opacity-50">
              {creating && <Loader2 className="w-4 h-4 animate-spin" />} {creating ? t('resources.creating') : t('resources.create')}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted transition">
              {t('resources.cancel')}
            </button>
          </div>
        </form>
      )}

      <div className="bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden">
        {resources.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">{t('resources.noResources')}</div>
        ) : (
          <div className="divide-y divide-border">
            {resources.map((r) => (
              <div key={r.id}>
                <div className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      {r.kind === 'FILE' ? <FileText className="w-4 h-4 text-indigo-600" /> : <Link2 className="w-4 h-4 text-indigo-600" />}
                      {r.title}
                    </div>
                    {r.description && <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>}
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {t('resources.createdBy')}: {r.createdBy.name} · {formatDateTime(r.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-muted-foreground">{t('resources.grantedCount').replace('{count}', String(r._count.grants))}</span>
                    <span className="text-[11px] text-muted-foreground">{t('resources.accessCount').replace('{count}', String(r._count.accessLogs))}</span>
                    <button type="button" onClick={() => toggleExpand(r.id)}
                      className="px-2.5 py-1 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition inline-flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" /> {t('resources.manageAccess')}
                    </button>
                    <button type="button" onClick={() => deleteResource(r.id)}
                      className="p-1.5 rounded-lg border border-border text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {expandedId === r.id && (
                  <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-background/50">
                    <div className="rounded-xl border border-border p-3">
                      <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {t('resources.grantAdmin')}</p>
                      {admins.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground mb-3">{t('resources.noAdmins')}</p>
                      ) : (
                        <div className="flex items-center gap-2 mb-3">
                          <select value={selectedAdminId} onChange={(e) => setSelectedAdminId(e.target.value)}
                            className="flex-1 px-2 py-1.5 border border-border rounded-lg text-xs bg-background outline-none">
                            <option value="">{t('resources.selectAdmin')}</option>
                            {admins.filter((a) => !grants.some((g) => g.adminId === a.id)).map((a) => (
                              <option key={a.id} value={a.id}>{a.name} — {a.email}</option>
                            ))}
                          </select>
                          <button type="button" onClick={() => grantAdmin(r.id)} disabled={!selectedAdminId}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium disabled:opacity-50">
                            {t('resources.grant')}
                          </button>
                        </div>
                      )}
                      {grants.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">{t('resources.noGrants')}</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {grants.map((g) => (
                            <li key={g.adminId} className="flex items-center justify-between text-xs">
                              <span>{g.admin.name} <span className="text-muted-foreground">({g.admin.email})</span></span>
                              <button type="button" onClick={() => revokeAdmin(r.id, g.adminId)} className="text-rose-600 hover:underline inline-flex items-center gap-1">
                                <X className="w-3 h-3" /> {t('resources.revoke')}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="rounded-xl border border-border p-3">
                      <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> {t('resources.accessHistory')}</p>
                      {logs.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">{t('resources.noAccessLogs')}</p>
                      ) : (
                        <ul className="space-y-1.5 max-h-56 overflow-y-auto">
                          {logs.map((l) => (
                            <li key={l.id} className="text-xs">
                              {l.admin.name} <span className="text-muted-foreground">({l.admin.email})</span>
                              <span className="text-muted-foreground"> — {formatDateTime(l.accessedAt)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
