'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Eye, EyeOff, GraduationCap, Pencil, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

type Offer = {
  id: string; privateUniversityName: string; exactLocation: string | null; publicTitle: string; publicDescription: string
  city: string; program: string; intake: string | null; minAge: number | null; maxAge: number | null
  tuitionMin: number | null; tuitionMax: number | null; tuitionPeriod: string; hostelMin: number | null; hostelMax: number | null
  hostelPeriod: string; stipendMin: number | null; stipendMax: number | null; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  startsAt: string | null; endsAt: string | null; showUniversityName: boolean; showExactLocation: boolean; showCity: boolean
  showProgram: boolean; showAge: boolean; showTuition: boolean; showHostel: boolean; showStipend: boolean
}

type Form = Omit<Offer, 'id' | 'startsAt' | 'endsAt'> & { startsAt: string; endsAt: string }
const emptyForm: Form = {
  privateUniversityName: '', exactLocation: '', publicTitle: '', publicDescription: '', city: '', program: '', intake: '',
  minAge: null, maxAge: null, tuitionMin: null, tuitionMax: null, tuitionPeriod: 'SEMESTER', hostelMin: null, hostelMax: null,
  hostelPeriod: 'MONTH', stipendMin: null, stipendMax: null, status: 'DRAFT', startsAt: '', endsAt: '',
  showUniversityName: false, showExactLocation: false, showCity: true, showProgram: true, showAge: true,
  showTuition: true, showHostel: true, showStipend: true,
}
const inputClass = 'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-indigo-500'
const labelClass = 'block text-sm font-medium text-foreground'
type VisibilityKey = 'showUniversityName' | 'showExactLocation' | 'showCity' | 'showProgram' | 'showAge' | 'showTuition' | 'showHostel' | 'showStipend'
const visibilityFields: [VisibilityKey, string][] = [
  ['showUniversityName', 'University name'], ['showExactLocation', 'Exact campus / address'], ['showCity', 'City'],
  ['showProgram', 'Program and intake'], ['showAge', 'Age range'], ['showTuition', 'Tuition fees'],
  ['showHostel', 'Hostel fees'], ['showStipend', 'Monthly stipend'],
]

function formFromOffer(offer: Offer): Form {
  return { ...offer, exactLocation: offer.exactLocation || '', intake: offer.intake || '', startsAt: offer.startsAt?.slice(0, 10) || '', endsAt: offer.endsAt?.slice(0, 10) || '' }
}
function amount(min: number | null, max: number | null, period: string) {
  if (min === null && max === null) return 'Not specified'
  const range = min !== null && max !== null ? `${min.toLocaleString()}–${max.toLocaleString()}` : `${(min ?? max)?.toLocaleString()}${min === null ? ' or less' : '+'}`
  return `¥${range} / ${period.toLowerCase()}`
}

export default function AdmissionOffersPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN' || session?.user?.role === 'OWNER'
  const [offers, setOffers] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Offer | 'new' | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const response = await fetch('/api/admission-offers', { credentials: 'include', cache: 'no-store' })
      if (!response.ok) throw new Error()
      setOffers(await response.json())
    } catch { toast.error('Could not load university offers') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function openNew() { setForm({ ...emptyForm }); setEditing('new') }
  function openEdit(offer: Offer) { setForm(formFromOffer(offer)); setEditing(offer) }
  function set<K extends keyof Form>(key: K, value: Form[K]) { setForm(current => ({ ...current, [key]: value })) }
  function setNumber(key: 'minAge' | 'maxAge' | 'tuitionMin' | 'tuitionMax' | 'hostelMin' | 'hostelMax' | 'stipendMin' | 'stipendMax', value: string) {
    set(key, value === '' ? null : Number(value))
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const isNew = editing === 'new'
      const response = await fetch(isNew ? '/api/admission-offers' : `/api/admission-offers/${(editing as Offer).id}`, {
        method: isNew ? 'POST' : 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not save offer')
      toast.success(isNew ? 'University offer created' : 'University offer updated')
      setEditing(null)
      await load()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save offer') }
    finally { setSaving(false) }
  }

  async function remove(offer: Offer) {
    if (!confirm(`Delete “${offer.publicTitle}”?`)) return
    const response = await fetch(`/api/admission-offers/${offer.id}`, { method: 'DELETE', credentials: 'include' })
    if (!response.ok) { toast.error('Could not delete offer'); return }
    toast.success('Offer deleted')
    await load()
  }

  return <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><div className="rounded-xl bg-indigo-100 p-2.5 dark:bg-indigo-500/15"><GraduationCap className="h-5 w-5 text-indigo-600 dark:text-indigo-400" /></div><div><h1 className="text-xl font-bold text-foreground">University offers</h1><p className="text-sm text-muted-foreground">Manage admission offers shown in the public directory on edvuno.top.</p></div></div>
      {isAdmin && <button onClick={openNew} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"><Plus className="h-4 w-4" />Add offer</button>}
    </div>
    <div className="mb-5 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-100">University names and exact locations stay private unless you switch them on for an offer. Fees are entered in RMB; tuition is per semester or year, hostel is per month, semester or year, and stipend is monthly.</div>
    {loading ? <p className="text-sm text-slate-600 dark:text-slate-300">Loading offers…</p> : offers.length === 0 ? <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-slate-600 dark:text-slate-300">No university offers yet. Add one to prepare your public directory.</div> : <div className="space-y-3">{offers.map(offer => <article key={offer.id} className="rounded-xl border border-border bg-card p-4"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><h2 className="font-semibold text-foreground">{offer.publicTitle}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${offer.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' : offer.status === 'ARCHIVED' ? 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'}`}>{offer.status.toLowerCase()}</span></div><p className="text-sm text-slate-600 dark:text-slate-300">{offer.privateUniversityName} · {offer.city} · {offer.program}{offer.intake ? ` · ${offer.intake}` : ''}</p><p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Tuition {amount(offer.tuitionMin, offer.tuitionMax, offer.tuitionPeriod)} · Hostel {amount(offer.hostelMin, offer.hostelMax, offer.hostelPeriod)} · Stipend {amount(offer.stipendMin, offer.stipendMax, 'month')}</p><p className="mt-2 flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">{offer.showUniversityName || offer.showExactLocation ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} Public identity: {offer.showUniversityName ? 'university name visible' : 'university name hidden'}, {offer.showExactLocation ? 'exact location visible' : 'exact location hidden'}</p></div><div className="flex shrink-0 gap-2"><button onClick={() => openEdit(offer)} className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted" aria-label="Edit offer"><Pencil className="h-4 w-4" /></button><button onClick={() => remove(offer)} className="rounded-lg border border-border p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10" aria-label="Delete offer"><Trash2 className="h-4 w-4" /></button></div></div></article>)}</div>}

    {editing && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="offer-form-title"><form onSubmit={save} className="mx-auto my-4 max-w-4xl rounded-2xl bg-background p-5 shadow-2xl sm:my-8 sm:p-7"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 id="offer-form-title" className="text-lg font-bold text-foreground">{editing === 'new' ? 'Add university offer' : 'Edit university offer'}</h2><p className="mt-1 text-sm text-muted-foreground">Fields marked public can appear on edvuno.top.</p></div><button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-border px-3 py-1.5 text-sm">Close</button></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className={labelClass}>Private university name<input required className={inputClass} value={form.privateUniversityName} onChange={e => set('privateUniversityName', e.target.value)} /></label><label className={labelClass}>Exact location (private by default)<input className={inputClass} value={form.exactLocation || ''} onChange={e => set('exactLocation', e.target.value)} placeholder="Campus or street address" /></label><label className={labelClass}>Public offer title<input required className={inputClass} value={form.publicTitle} onChange={e => set('publicTitle', e.target.value)} placeholder="Example: Engineering scholarship pathway" /></label><label className={labelClass}>City<input required className={inputClass} value={form.city} onChange={e => set('city', e.target.value)} /></label><label className={labelClass}>Program<input required className={inputClass} value={form.program} onChange={e => set('program', e.target.value)} /></label><label className={labelClass}>Intake / term<input className={inputClass} value={form.intake || ''} onChange={e => set('intake', e.target.value)} placeholder="September 2027" /></label><label className={`${labelClass} sm:col-span-2`}>Public description<textarea className={inputClass} rows={3} value={form.publicDescription} onChange={e => set('publicDescription', e.target.value)} placeholder="Avoid identifying details here if the university should remain anonymous." /></label></div>
      <div className="mt-5 grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2"><div><h3 className="mb-3 text-sm font-semibold">Eligibility</h3><div className="grid grid-cols-2 gap-3"><label className={labelClass}>Minimum age<input type="number" min="0" className={inputClass} value={form.minAge ?? ''} onChange={e => setNumber('minAge', e.target.value)} /></label><label className={labelClass}>Maximum age<input type="number" min="0" className={inputClass} value={form.maxAge ?? ''} onChange={e => setNumber('maxAge', e.target.value)} /></label></div></div><div><h3 className="mb-3 text-sm font-semibold">Tuition (RMB)</h3><div className="grid grid-cols-2 gap-3"><label className={labelClass}>Minimum<input type="number" min="0" className={inputClass} value={form.tuitionMin ?? ''} onChange={e => setNumber('tuitionMin', e.target.value)} /></label><label className={labelClass}>Maximum<input type="number" min="0" className={inputClass} value={form.tuitionMax ?? ''} onChange={e => setNumber('tuitionMax', e.target.value)} /></label><label className={`${labelClass} col-span-2`}>Tuition period<select className={inputClass} value={form.tuitionPeriod} onChange={e => set('tuitionPeriod', e.target.value)}><option value="SEMESTER">Per semester</option><option value="YEAR">Per year</option></select></label></div></div><div><h3 className="mb-3 text-sm font-semibold">Hostel (RMB)</h3><div className="grid grid-cols-2 gap-3"><label className={labelClass}>Minimum<input type="number" min="0" className={inputClass} value={form.hostelMin ?? ''} onChange={e => setNumber('hostelMin', e.target.value)} /></label><label className={labelClass}>Maximum<input type="number" min="0" className={inputClass} value={form.hostelMax ?? ''} onChange={e => setNumber('hostelMax', e.target.value)} /></label><label className={`${labelClass} col-span-2`}>Hostel period<select className={inputClass} value={form.hostelPeriod} onChange={e => set('hostelPeriod', e.target.value)}><option value="MONTH">Per month</option><option value="SEMESTER">Per semester</option><option value="YEAR">Per year</option></select></label></div></div><div><h3 className="mb-3 text-sm font-semibold">Stipend (RMB per month)</h3><div className="grid grid-cols-2 gap-3"><label className={labelClass}>Minimum<input type="number" min="0" className={inputClass} value={form.stipendMin ?? ''} onChange={e => setNumber('stipendMin', e.target.value)} /></label><label className={labelClass}>Maximum<input type="number" min="0" className={inputClass} value={form.stipendMax ?? ''} onChange={e => setNumber('stipendMax', e.target.value)} /></label></div></div></div>
      <details className="mt-5 rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">Public visibility and publish dates</summary><p className="my-3 text-xs text-muted-foreground">Hidden values are omitted from the public website and are not used by its filters.</p><div className="grid gap-2 sm:grid-cols-2">{visibilityFields.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={Boolean(form[key])} onChange={e => set(key, e.target.checked)} />Show {label} publicly</label>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className={labelClass}>Status<select className={inputClass} value={form.status} onChange={e => set('status', e.target.value as Form['status'])}><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></select></label><label className={labelClass}>Publish from<input type="date" className={inputClass} value={form.startsAt} onChange={e => set('startsAt', e.target.value)} /></label><label className={labelClass}>Publish until<input type="date" className={inputClass} value={form.endsAt} onChange={e => set('endsAt', e.target.value)} /></label></div></details>
      <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button><button disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save offer'}</button></div>
    </form></div>}
  </div>
}
