'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock3, Plus, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/src/lib/i18n/LanguageContext'

const stages = ['APPLIED', 'PRE_ADMISSION', 'ADMITTED', 'JW_RECEIVED', 'DOCUMENTS_REQUIRED', 'REJECTED', 'WITHDRAWN', 'OTHER'] as const
type Stage = typeof stages[number]
type HistoryEntry = {
  id: string
  fromStage: Stage | null
  toStage: Stage
  fromCustomStageLabel: string | null
  toCustomStageLabel: string | null
  note: string | null
  createdAt: string
  actor: { name: string | null } | null
}
type Application = {
  id: string
  universityId: string | null
  universityName: string
  program: string | null
  intake: string | null
  stage: Stage
  customStageLabel: string | null
  notes: string | null
  updatedAt: string
  history: HistoryEntry[]
}
type University = { id: string; name: string }
type Draft = {
  universityId: string
  universityName: string
  program: string
  intake: string
  stage: Stage
  customStageLabel: string
  note: string
}

const emptyDraft = (): Draft => ({ universityId: '', universityName: '', program: '', intake: '', stage: 'APPLIED', customStageLabel: '', note: '' })
const makeDraft = (app: Application): Draft => ({
  universityId: app.universityId ?? '', universityName: app.universityName, program: app.program ?? '', intake: app.intake ?? '',
  stage: app.stage, customStageLabel: app.customStageLabel ?? '', note: app.notes ?? '',
})

export function ApplicationsPanel({ studentId, canManage, canCreate }: { studentId: string; canManage: boolean; canCreate: boolean }) {
  const { t, formatDateTime } = useLanguage()
  const [applications, setApplications] = useState<Application[]>([])
  const [universities, setUniversities] = useState<University[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const stageLabel = useCallback((stage: Stage, custom?: string | null) => {
    if (stage === 'OTHER' && custom) return custom
    const labels: Record<Stage, string> = {
      APPLIED: t('students.applicationApplied'),
      PRE_ADMISSION: t('students.applicationPreAdmission'),
      ADMITTED: t('students.applicationAdmitted'),
      JW_RECEIVED: t('students.applicationJwReceived'),
      DOCUMENTS_REQUIRED: t('students.applicationDocumentsRequired'),
      REJECTED: t('students.applicationRejected'),
      WITHDRAWN: t('students.applicationWithdrawn'),
      OTHER: t('students.applicationOther'),
    }
    return labels[stage]
  }, [t])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadFailed(false)
    try {
      const response = await fetch(`/api/students/${studentId}/applications`, { credentials: 'include', cache: 'no-store' })
      if (!response.ok) throw new Error()
      const rows = await response.json() as Application[]
      setApplications(rows)
      setDrafts(Object.fromEntries(rows.map(row => [row.id, makeDraft(row)])))
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!canManage) return
    fetch('/api/universities', { credentials: 'include', cache: 'no-store' })
      .then(async response => {
        if (!response.ok) return
        const rows = await response.json()
        if (Array.isArray(rows)) setUniversities(rows.map((row: any) => ({ id: row.id, name: row.name })))
      })
      .catch(() => {})
  }, [canManage])

  const universityNames = useMemo(() => new Map(universities.map(university => [university.id, university.name])), [universities])
  const changeDraft = (id: string, patch: Partial<Draft>) => setDrafts(current => ({ ...current, [id]: { ...current[id], ...patch } }))

  async function save(id: string) {
    const draft = drafts[id]
    const current = applications.find(application => application.id === id)
    if (!draft || !current || saving) return
    if (!draft.universityName.trim()) { toast.error(t('students.applicationUniversityRequired')); return }
    if (draft.stage === 'OTHER' && !draft.customStageLabel.trim()) { toast.error(t('students.applicationOtherRequired')); return }
    setSaving(id)
    try {
      const response = await fetch(`/api/students/${studentId}/applications/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          expectedUpdatedAt: current.updatedAt, universityId: draft.universityId || null,
          universityName: draft.universityName.trim(), program: draft.program, intake: draft.intake,
          stage: draft.stage, customStageLabel: draft.stage === 'OTHER' ? draft.customStageLabel.trim() : null, note: draft.note,
        }),
      })
      if (response.status === 409) { toast.error(t('students.applicationChanged')); await load(); return }
      if (!response.ok) throw new Error()
      const updated = await response.json() as Application
      setApplications(rows => rows.map(row => row.id === id ? updated : row))
      setDrafts(rows => ({ ...rows, [id]: makeDraft(updated) }))
      toast.success(t('students.applicationSaved'))
    } catch {
      toast.error(t('students.applicationSaveFailed'))
    } finally { setSaving(null) }
  }

  async function create() {
    if (saving) return
    if (!newDraft.universityName.trim()) { toast.error(t('students.applicationUniversityRequired')); return }
    if (newDraft.stage === 'OTHER' && !newDraft.customStageLabel.trim()) { toast.error(t('students.applicationOtherRequired')); return }
    setSaving('new')
    try {
      const response = await fetch(`/api/students/${studentId}/applications`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          universityId: newDraft.universityId || undefined, universityName: newDraft.universityName.trim(),
          program: newDraft.program, intake: newDraft.intake, stage: newDraft.stage,
          customStageLabel: newDraft.stage === 'OTHER' ? newDraft.customStageLabel.trim() : undefined, note: newDraft.note,
        }),
      })
      if (response.status === 409) { toast.error(t('students.applicationReviewRequired')); return }
      if (!response.ok) throw new Error()
      const created = await response.json() as Application
      setApplications(rows => [created, ...rows])
      setDrafts(rows => ({ ...rows, [created.id]: makeDraft(created) }))
      setNewDraft(emptyDraft())
      toast.success(t('students.applicationAdded'))
    } catch {
      toast.error(t('students.applicationSaveFailed'))
    } finally { setSaving(null) }
  }

  const universityInput = (draft: Draft, update: (patch: Partial<Draft>) => void) => (
    <>
      {universities.length > 0 && (
        <select
          value={draft.universityId}
          onChange={event => {
            const universityId = event.target.value
            update({ universityId, universityName: universityId ? universityNames.get(universityId) ?? '' : '' })
          }}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
          aria-label={t('students.applicationUniversity')}
        >
          <option value="">{t('students.applicationTypeUniversity')}</option>
          {universities.map(university => <option key={university.id} value={university.id}>{university.name}</option>)}
        </select>
      )}
      {!draft.universityId && (
        <input value={draft.universityName} onChange={event => update({ universityName: event.target.value })} maxLength={200}
          placeholder={t('students.applicationUniversity')} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm" />
      )}
      {draft.universityId && <p className="text-sm text-muted-foreground">{draft.universityName}</p>}
    </>
  )

  const editor = (draft: Draft, update: (patch: Partial<Draft>) => void) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">{universityInput(draft, update)}</div>
      <input value={draft.program} onChange={event => update({ program: event.target.value })} maxLength={200}
        placeholder={t('students.applicationProgram')} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm" />
      <input value={draft.intake} onChange={event => update({ intake: event.target.value })} maxLength={100}
        placeholder={t('students.applicationIntake')} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm" />
      <select value={draft.stage} onChange={event => update({ stage: event.target.value as Stage })}
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm" aria-label={t('students.applicationStage')}>
        {stages.map(stage => <option key={stage} value={stage}>{stageLabel(stage)}</option>)}
      </select>
      {draft.stage === 'OTHER' && <input value={draft.customStageLabel} onChange={event => update({ customStageLabel: event.target.value })} maxLength={100}
        placeholder={t('students.applicationOtherLabel')} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm" />}
      <textarea value={draft.note} onChange={event => update({ note: event.target.value })} maxLength={5000} rows={2}
        placeholder={t('students.applicationNote')} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm sm:col-span-2" />
    </div>
  )

  return (
    <section className="bg-card rounded-2xl shadow-sm border border-border/60 p-6" aria-labelledby="applications-title">
      <h3 id="applications-title" className="text-base font-semibold text-foreground mb-4 pb-3 border-b border-border">{t('students.universityApplications')}</h3>
      {loading ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : loadFailed ? (
        <p className="text-sm text-rose-600" role="alert">{t('students.applicationsLoadFailed')}</p>
      ) : (
        <div className="space-y-5">
          {applications.length === 0 && <p className="text-sm text-muted-foreground">{t('students.noApplications')}</p>}
          {applications.map(application => {
            const draft = drafts[application.id] ?? makeDraft(application)
            return (
              <article key={application.id} className="rounded-xl border border-border p-4 space-y-4">
                {canManage ? editor(draft, patch => changeDraft(application.id, patch)) : (
                  <div>
                    <h4 className="font-semibold text-foreground">{application.universityName}</h4>
                    <p className="text-sm text-muted-foreground">{[application.program, application.intake].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                )}
                {!canManage && <p className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">{stageLabel(application.stage, application.customStageLabel)}</p>}
                {!canManage && application.notes && <p className="whitespace-pre-wrap break-words text-sm text-foreground">{application.notes}</p>}
                {canManage && <button type="button" onClick={() => void save(application.id)} disabled={saving !== null}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                  <Save className="h-4 w-4" />{saving === application.id ? t('common.loading') : t('students.saveApplication')}
                </button>}
                <div>
                  <h5 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Clock3 className="h-4 w-4" />{t('students.applicationHistory')}</h5>
                  {application.history.length ? <ol className="divide-y divide-border border-t border-border">
                    {application.history.map(event => <li key={event.id} className="space-y-1 py-3 last:pb-0">
                      <p className="text-sm font-medium text-foreground">
                        {event.fromStage ? `${stageLabel(event.fromStage, event.fromCustomStageLabel)} → ` : ''}{stageLabel(event.toStage, event.toCustomStageLabel)}
                      </p>
                      <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                        <span>{event.actor?.name ?? t('students.unknownReviewActor')}</span><time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
                      </p>
                      {event.note && <p className="whitespace-pre-wrap break-words text-sm text-foreground">{event.note}</p>}
                    </li>)}
                  </ol> : <p className="text-sm text-muted-foreground">{t('students.applicationHistoryEmpty')}</p>}
                </div>
              </article>
            )
          })}
          {canManage && (
            <div className="border-t border-border pt-5 space-y-3">
              <h4 className="font-semibold text-foreground">{t('students.addApplication')}</h4>
              {canCreate ? <>
                {editor(newDraft, patch => setNewDraft(current => ({ ...current, ...patch })))}
                <button type="button" onClick={() => void create()} disabled={saving !== null}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                  <Plus className="h-4 w-4" />{saving === 'new' ? t('common.loading') : t('students.addApplication')}
                </button>
              </> : <p className="text-sm text-muted-foreground">{t('students.applicationReviewRequired')}</p>}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
