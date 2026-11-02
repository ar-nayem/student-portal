'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, ArrowRight, Check } from 'lucide-react'
import { TRIAL_DAYS } from '@/src/lib/trial'

export default function SignupPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ organizationName: string; trialEndsAt: string } | null>(null)
  const [form, setForm] = useState({
    organizationName: '', ownerName: '', ownerEmail: '', phone: '', password: '',
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/public/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setDone({ organizationName: data.organizationName, trialEndsAt: data.trialEndsAt })
      } else {
        setError(data.error || 'Could not create your account. Please try again.')
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full px-3.5 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm bg-card transition'

  if (done) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto">
            <Check className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight">{done.organizationName} is ready</h1>
          <p className="mt-3 text-muted-foreground text-sm leading-relaxed">
            Your {TRIAL_DAYS}-day trial runs until{' '}
            <strong className="text-foreground">{new Date(done.trialEndsAt).toDateString()}</strong>.
            Sign in with the email and password you just chose — we have emailed you the details too.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="mt-7 w-full px-5 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition inline-flex items-center justify-center gap-2"
          >
            Go to sign in <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/brand/brand-logo-dark.svg" alt="EDVUNO" className="h-auto w-28 dark:hidden" /><img src="/brand/brand-logo-light.svg" alt="EDVUNO" className="hidden h-auto w-28 dark:block" />
          </Link>
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition">
            Already have an account?
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-12 sm:py-16">
        <span className="inline-flex items-center px-3 py-1 rounded-full border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
          {TRIAL_DAYS}-day free trial · no card required
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Create your agency account</h1>
        <p className="mt-2.5 text-sm text-muted-foreground">
          You will be the owner of this organisation and can invite your team once you are in.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Company / agency name</label>
            <input
              type="text" required autoFocus
              value={form.organizationName}
              onChange={(e) => setForm((p) => ({ ...p, organizationName: e.target.value }))}
              placeholder="e.g. Dream Abroad Education"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Your full name</label>
            <input
              type="text" required
              value={form.ownerName}
              onChange={(e) => setForm((p) => ({ ...p, ownerName: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Work email</label>
            <input
              type="email" required
              value={form.ownerEmail}
              onChange={(e) => setForm((p) => ({ ...p, ownerEmail: e.target.value }))}
              placeholder="you@youragency.com"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Phone <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Password</label>
            <input
              type="password" required minLength={8}
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              placeholder="At least 8 characters"
              className={inputClass}
            />
          </div>

          {error && (
            <p className="text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl px-3.5 py-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-5 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? 'Creating your account…' : `Start ${TRIAL_DAYS}-day trial`}
          </button>

          <p className="text-xs text-muted-foreground text-center">
            No card required. Everything you add during the trial stays if you continue.
          </p>
        </form>
      </main>
    </div>
  )
}
