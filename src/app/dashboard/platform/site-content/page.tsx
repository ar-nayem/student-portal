'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

type Item = { id: string; type: string; slug: string; title: string; summary: string; body: string; imageUrl: string | null; linkUrl: string | null; province: string | null; city: string | null; subject: string | null; level: string | null; sortOrder: number; published: boolean }
const types = ['OFFER', 'UNIVERSITY', 'SCHOLARSHIP', 'ARTICLE', 'SERVICE', 'FAQ', 'PAGE']
const blank = { type: 'OFFER', slug: '', title: '', summary: '', body: '', imageUrl: '', linkUrl: '', province: '', city: '', subject: '', level: '', sortOrder: 0, published: false }
export default function SiteContentPage() {
  const [items, setItems] = useState<Item[]>([])
  const [form, setForm] = useState({ ...blank })
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function load() {
    const response = await fetch('/api/platform/site-content', { cache: 'no-store' })
    if (response.ok) setItems(await response.json())
    else toast.error('Could not load EDVUNO content')
  }
  useEffect(() => { load() }, [])
  function set(key: keyof typeof blank, value: string | number | boolean) { setForm(prev => ({ ...prev, [key]: value })) }
  function edit(item: Item) { setEditing(item.id); setForm({ type: item.type, slug: item.slug, title: item.title, summary: item.summary, body: item.body, imageUrl: item.imageUrl || '', linkUrl: item.linkUrl || '', province: item.province || '', city: item.city || '', subject: item.subject || '', level: item.level || '', sortOrder: item.sortOrder, published: item.published }); scrollTo({ top: 0, behavior: 'smooth' }) }
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try {
      const response = await fetch(editing ? `/api/platform/site-content/${editing}` : '/api/platform/site-content', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Save failed')
      toast.success(form.published ? 'Published on EDVUNO website' : 'Draft saved')
      setForm({ ...blank }); setEditing(null); await load()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Save failed') }
    finally { setBusy(false) }
  }
  async function remove(item: Item) {
    if (!confirm(`Delete “${item.title}”?`)) return
    const response = await fetch(`/api/platform/site-content/${item.id}`, { method: 'DELETE' })
    if (response.ok) { toast.success('Deleted'); await load() } else toast.error('Delete failed')
  }
  const field = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white'
  return <div className="mx-auto max-w-5xl space-y-8 p-5 md:p-8">
    <div><h1 className="text-3xl font-bold">EDVUNO website content</h1><p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Create drafts here. Only published items appear on <a href="https://edvuno.top" target="_blank" rel="noreferrer" className="underline">edvuno.top</a>. This content is separate from every organization’s portal data.</p></div>
    <form onSubmit={save} className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <h2 className="text-xl font-semibold">{editing ? 'Edit content' : 'Add content'}</h2>
      <div className="grid gap-4 md:grid-cols-2"><label>Content type<select className={field} value={form.type} onChange={e => set('type', e.target.value)}>{types.map(t => <option key={t}>{t}</option>)}</select></label><label>URL slug<input className={field} value={form.slug} onChange={e => set('slug', e.target.value)} required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="e.g. autumn-intake" /></label></div>
      <label className="block">Title<input className={field} value={form.title} onChange={e => set('title', e.target.value)} required maxLength={180} /></label>
      <label className="block">Short description<textarea className={field} value={form.summary} onChange={e => set('summary', e.target.value)} maxLength={600} rows={2} /></label>
      <label className="block">Details (plain text)<textarea className={field} value={form.body} onChange={e => set('body', e.target.value)} maxLength={10000} rows={5} /></label>
      <div className="grid gap-4 md:grid-cols-2"><label>Image HTTPS URL<input className={field} type="url" value={form.imageUrl} onChange={e => set('imageUrl', e.target.value)} placeholder="https://…" /></label><label>Details / official source HTTPS URL<input className={field} type="url" value={form.linkUrl} onChange={e => set('linkUrl', e.target.value)} placeholder="https://…" /></label></div>
      <div className="grid gap-4 md:grid-cols-4">{(['province', 'city', 'subject', 'level'] as const).map(key => <label key={key} className="capitalize">{key}<input className={field} value={form[key]} onChange={e => set(key, e.target.value)} /></label>)}</div>
      <div className="flex flex-wrap items-center gap-5"><label>Display order<input className={`${field} w-24`} type="number" min={-10000} max={10000} value={form.sortOrder} onChange={e => set('sortOrder', Number(e.target.value))} /></label><label className="flex items-center gap-2"><input type="checkbox" checked={form.published} onChange={e => set('published', e.target.checked)} /> Publish to website</label></div>
      <p className="text-xs text-gray-500">Publish only facts, offers, scholarship terms, and affiliations you have verified. Add an official source link where possible. For a PAGE item, use the slug home, study, about, or contact to add page-specific text.</p>
      <div className="flex gap-3"><button className="rounded-lg bg-emerald-700 px-5 py-2 font-semibold text-white disabled:opacity-50" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create content'}</button>{editing && <button type="button" onClick={() => { setEditing(null); setForm({ ...blank }) }}>Cancel</button>}</div>
    </form>
    <section><h2 className="mb-4 text-xl font-semibold">Content ({items.length})</h2><div className="space-y-3">{items.map(item => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"><div><div className="text-xs font-bold tracking-wide text-emerald-700">{item.type} · {item.published ? 'PUBLISHED' : 'DRAFT'}</div><h3 className="font-semibold">{item.title}</h3><p className="text-sm text-gray-500">/{item.slug}</p></div><div className="flex gap-3"><button onClick={() => edit(item)} className="text-emerald-700 underline">Edit</button><button onClick={() => remove(item)} className="text-red-700 underline">Delete</button></div></article>)}{!items.length && <p className="text-sm text-gray-500">No EDVUNO content yet. Create your first draft above.</p>}</div></section>
  </div>
}
