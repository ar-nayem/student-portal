'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Eye, EyeOff, Megaphone, Pencil, Plus, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/src/lib/i18n/LanguageContext'

type Offer = {
  id: string; title: string; description: string; imageUrl: string | null; startDate: string; endDate: string | null
  isActive: boolean; publishToWebsite: boolean; status: 'RUNNING' | 'UPCOMING' | 'EXPIRED' | 'PAUSED'
  privateUniversityName: string | null; exactLocation: string | null; publicTitle: string | null; publicDescription: string | null
  city: string | null; program: string | null; intake: string | null; minAge: number | null; maxAge: number | null
  tuitionMin: number | null; tuitionMax: number | null; tuitionPeriod: string; hostelMin: number | null; hostelMax: number | null
  hostelPeriod: string; stipendMin: number | null; stipendMax: number | null; showUniversityName: boolean; showExactLocation: boolean
  showCity: boolean; showProgram: boolean; showAge: boolean; showTuition: boolean; showHostel: boolean; showStipend: boolean
  createdBy?: { name: string }
}

type Form = Omit<Offer, 'id' | 'status' | 'createdBy' | 'startDate' | 'endDate'> & { startDate: string; endDate: string }
const emptyForm: Form = {
  title: '', description: '', imageUrl: '', startDate: '', endDate: '', isActive: true, publishToWebsite: true,
  privateUniversityName: '', exactLocation: '', publicTitle: '', publicDescription: '', city: '', program: '', intake: '',
  minAge: null, maxAge: null, tuitionMin: null, tuitionMax: null, tuitionPeriod: 'SEMESTER', hostelMin: null, hostelMax: null,
  hostelPeriod: 'MONTH', stipendMin: null, stipendMax: null, showUniversityName: false, showExactLocation: false,
  showCity: true, showProgram: true, showAge: true, showTuition: true, showHostel: true, showStipend: true,
}
const STATUS_STYLES: Record<Offer['status'], string> = {
  RUNNING: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  UPCOMING: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400',
  EXPIRED: 'bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400',
  PAUSED: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
}
const inputClass = 'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-emerald-500'
const labelClass = 'block text-sm font-medium text-foreground'
type VisibilityKey = 'showUniversityName' | 'showExactLocation' | 'showCity' | 'showProgram' | 'showAge' | 'showTuition' | 'showHostel' | 'showStipend'
const visibilityFields: [VisibilityKey, string][] = [
  ['showUniversityName', 'University name'], ['showExactLocation', 'Exact campus / address'], ['showCity', 'City'],
  ['showProgram', 'Program and intake'], ['showAge', 'Age range'], ['showTuition', 'Tuition fees'],
  ['showHostel', 'Hostel fees'], ['showStipend', 'Monthly stipend'],
]
const numberFields = ['minAge', 'maxAge', 'tuitionMin', 'tuitionMax', 'hostelMin', 'hostelMax', 'stipendMin', 'stipendMax'] as const

function toDateInput(value: string | null) { return value ? value.slice(0, 10) : '' }
function amount(min: number | null, max: number | null, period: string) {
  if (min === null && max === null) return 'Not set'
  const range = min !== null && max !== null ? `${min.toLocaleString()}–${max.toLocaleString()}` : `${(min ?? max)?.toLocaleString()}${min === null ? ' or less' : '+'}`
  return `¥${range} / ${period.toLowerCase()}`
}

function formFromOffer(offer: Offer): Form {
  return {
    ...offer, startDate: toDateInput(offer.startDate), endDate: toDateInput(offer.endDate),
    imageUrl: offer.imageUrl || '', privateUniversityName: offer.privateUniversityName || '', exactLocation: offer.exactLocation || '',
    publicTitle: offer.publicTitle || '', publicDescription: offer.publicDescription || '', city: offer.city || '', program: offer.program || '', intake: offer.intake || '',
  }
}

export default function OffersPage() {
  const { data: session } = useSession()
  const { formatDate } = useLanguage()
  const isAdmin = session?.user?.role === 'ADMIN' || session?.user?.role === 'OWNER'
  const [offers, setOffers] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Offer | 'new' | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)

  function load() {
    setLoading(true)
    fetch('/api/offers?all=true', { credentials: 'include', cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error()
        return response.json()
      })
      .then(data => setOffers(Array.isArray(data) ? data : []))
      .catch(() => toast.error('Failed to load offers'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  function openNew() {
    setForm({ ...emptyForm, startDate: toDateInput(new Date().toISOString()) })
    setEditing('new')
  }
  function openEdit(offer: Offer) { setForm(formFromOffer(offer)); setEditing(offer) }
  function set<K extends keyof Form>(key: K, value: Form[K]) { setForm(current => ({ ...current, [key]: value })) }
  function setNumber(key: typeof numberFields[number], value: string) { set(key, value === '' ? null : Number(value)) }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!form.title.trim() || !form.description.trim() || !form.startDate) {
      toast.error('Offer title, description and start date are required')
      return
    }
    setSaving(true)
    try {
      const isNew = editing === 'new'
      const response = await fetch(isNew ? '/api/offers' : `/api/offers/${(editing as Offer).id}`, {
        method: isNew ? 'POST' : 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, publicTitle: form.title, publicDescription: form.description }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not save offer')
      toast.success(isNew ? 'Offer added' : 'Offer updated')
      setEditing(null)
      load()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save offer') }
    finally { setSaving(false) }
  }

  async function remove(offer: Offer) {
    if (!confirm(`Delete “${offer.title}”? This cannot be undone.`)) return
    try {
      const response = await fetch(`/api/offers/${offer.id}`, { method: 'DELETE', credentials: 'include' })
      if (!response.ok) throw new Error()
      toast.success('Offer deleted')
      load()
    } catch { toast.error('Could not delete offer') }
  }

  return <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-100 p-2.5 dark:bg-emerald-500/15"><Megaphone className="h-5 w-5 text-emerald-700 dark:text-emerald-400" /></div><div><h1 className="text-xl font-bold text-foreground">Offers</h1><p className="text-sm text-muted-foreground">Add once here to update the portal and, when published, the EDVUNO website.</p></div></div>
      {isAdmin && <button onClick={openNew} className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"><Plus className="h-4 w-4" />New offer</button>}
    </div>
    <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100">Offers are entered once. Turn on “Show on edvuno.top” to publish the same offer to the public directory. The university name and exact location remain hidden by default; the other public fields are individually controlled.</div>
    {loading ? <p className="text-sm text-foreground">Loading offers…</p> : offers.length === 0 ? <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-foreground">No offers yet.</div> : <div className="space-y-3">{offers.map(offer => <article key={offer.id} className="rounded-xl border border-border bg-card p-4"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><h2 className="font-semibold text-foreground">{offer.title}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[offer.status]}`}>{offer.status}</span><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${offer.publishToWebsite && offer.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400'}`}>{offer.publishToWebsite && offer.isActive ? 'On edvuno.top' : 'Portal only'}</span></div><p className="line-clamp-3 whitespace-pre-line text-sm text-foreground">{offer.description}</p>{offer.publishToWebsite && offer.city && offer.program && <p className="mt-2 text-xs text-foreground">{offer.city} · {offer.program}{offer.intake ? ` · ${offer.intake}` : ''} · Tuition {amount(offer.tuitionMin, offer.tuitionMax, offer.tuitionPeriod)} · Hostel {amount(offer.hostelMin, offer.hostelMax, offer.hostelPeriod)} · Stipend {amount(offer.stipendMin, offer.stipendMax, 'month')}</p>}<p className="mt-2 text-xs text-foreground">{formatDate(offer.startDate)}{offer.endDate ? ` – ${formatDate(offer.endDate)}` : ' – ongoing'}{offer.createdBy?.name ? ` · by ${offer.createdBy.name}` : ''}</p></div><div className="flex shrink-0 gap-2"><button onClick={() => openEdit(offer)} className="rounded-lg border border-border p-2 text-foreground hover:bg-muted" aria-label="Edit offer"><Pencil className="h-4 w-4" /></button><button onClick={() => remove(offer)} className="rounded-lg border border-border p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10" aria-label="Delete offer"><Trash2 className="h-4 w-4" /></button></div></div></article>)}</div>}

    {editing && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="offer-form-title"><form onSubmit={save} className="mx-auto my-4 max-w-4xl rounded-2xl bg-background p-5 shadow-2xl sm:my-8 sm:p-7">
      <div className="mb-5 flex items-start justify-between gap-4"><div><h2 id="offer-form-title" className="text-lg font-bold text-foreground">{editing === 'new' ? 'New offer' : 'Edit offer'}</h2><p className="mt-1 text-sm text-muted-foreground">Save once. The offer stays in the portal and can also appear on edvuno.top.</p></div><button type="button" onClick={() => !saving && setEditing(null)} className="rounded-lg border border-border px-3 py-1.5 text-sm"><X className="inline h-4 w-4" /> Close</button></div>

      <section className="rounded-xl border border-border p-4"><h3 className="mb-3 text-sm font-semibold">Offer information</h3><div className="grid gap-4 sm:grid-cols-2"><label className={`${labelClass} sm:col-span-2`}>Title (shown in the portal and publicly when published)<input required className={inputClass} value={form.title} onChange={e => set('title', e.target.value)} /></label><label className={`${labelClass} sm:col-span-2`}>Description (shown in the portal and publicly when published)<textarea required rows={3} className={inputClass} value={form.description} onChange={e => set('description', e.target.value)} /></label><label className={`${labelClass} sm:col-span-2`}>Image URL (optional)<input className={inputClass} value={form.imageUrl || ''} onChange={e => set('imageUrl', e.target.value)} /></label><label className={labelClass}>Start date<input required type="date" className={inputClass} value={form.startDate} onChange={e => set('startDate', e.target.value)} /></label><label className={labelClass}>End date (optional)<input type="date" className={inputClass} value={form.endDate} onChange={e => set('endDate', e.target.value)} /></label></div></section>

      <section className="mt-4 rounded-xl border border-border p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Public directory details</h3><p className="mt-1 text-xs text-muted-foreground">Use the public description above for customer-safe wording.</p></div><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={form.publishToWebsite} onChange={e => set('publishToWebsite', e.target.checked)} />Show on edvuno.top</label></div>
        {form.publishToWebsite && <><div className="grid gap-4 sm:grid-cols-2"><label className={labelClass}>University name (private by default)<input required={form.publishToWebsite && editing === 'new'} className={inputClass} value={form.privateUniversityName || ''} onChange={e => set('privateUniversityName', e.target.value)} /></label><label className={labelClass}>Exact campus / address (private by default)<input className={inputClass} value={form.exactLocation || ''} onChange={e => set('exactLocation', e.target.value)} placeholder="Campus or street address" /></label><label className={labelClass}>City<input required={form.publishToWebsite && editing === 'new'} className={inputClass} value={form.city || ''} onChange={e => set('city', e.target.value)} /></label><label className={labelClass}>Program<input required={form.publishToWebsite && editing === 'new'} className={inputClass} value={form.program || ''} onChange={e => set('program', e.target.value)} /></label><label className={`${labelClass} sm:col-span-2`}>Intake / term<input className={inputClass} value={form.intake || ''} onChange={e => set('intake', e.target.value)} placeholder="September 2027" /></label></div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2"><div className="rounded-lg bg-muted/40 p-3"><h4 className="mb-2 text-sm font-semibold">Eligibility</h4><div className="grid grid-cols-2 gap-3">{(['minAge', 'maxAge'] as const).map((key, i) => <label key={key} className={labelClass}>{i === 0 ? 'Minimum age' : 'Maximum age'}<input type="number" min="0" className={inputClass} value={form[key] ?? ''} onChange={e => setNumber(key, e.target.value)} /></label>)}</div></div>
            {(['tuition', 'hostel', 'stipend'] as const).map(kind => { const minKey = `${kind}Min` as typeof numberFields[number]; const maxKey = `${kind}Max` as typeof numberFields[number]; const periodKey = kind === 'tuition' ? 'tuitionPeriod' : kind === 'hostel' ? 'hostelPeriod' : null; return <div key={kind} className="rounded-lg bg-muted/40 p-3"><h4 className="mb-2 text-sm font-semibold">{kind === 'tuition' ? 'Tuition' : kind === 'hostel' ? 'Hostel' : 'Stipend'} (RMB{kind === 'stipend' ? ' per month' : ''})</h4><div className="grid grid-cols-2 gap-3"><label className={labelClass}>Minimum<input type="number" min="0" className={inputClass} value={form[minKey] ?? ''} onChange={e => setNumber(minKey, e.target.value)} /></label><label className={labelClass}>Maximum<input type="number" min="0" className={inputClass} value={form[maxKey] ?? ''} onChange={e => setNumber(maxKey, e.target.value)} /></label>{periodKey && <label className={`${labelClass} col-span-2`}>Billing period<select className={inputClass} value={form[periodKey]} onChange={e => set(periodKey, e.target.value)}>{(kind === 'tuition' ? [['SEMESTER', 'Per semester'], ['YEAR', 'Per year']] : [['MONTH', 'Per month'], ['SEMESTER', 'Per semester'], ['YEAR', 'Per year']]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}</div></div> })}
          </div>
          <details className="mt-4 rounded-lg border border-border p-3"><summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">{form.showUniversityName || form.showExactLocation ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} Choose which details customers can see</summary><p className="my-3 text-xs text-muted-foreground">Hidden fields are not sent to the public website and do not appear in its filters.</p><div className="grid gap-2 sm:grid-cols-2">{visibilityFields.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form[key]} onChange={e => set(key, e.target.checked)} />Show {label}</label>)}</div></details></>}
      </section>

      <label className="mt-4 flex items-center gap-2 rounded-xl border border-border p-4 text-sm"><input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} />Active in the portal and chatbot</label>
      <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button><button disabled={saving} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save offer'}</button></div>
    </form></div>}
  </div>
}
