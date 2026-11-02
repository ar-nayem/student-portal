'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Loader2, ArrowLeft, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/src/lib/i18n/LanguageContext'
import { LanguageToggle } from '@/src/components/LanguageToggle'

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  )
}

function RegisterForm() {
  const { t } = useLanguage()
  const searchParams = useSearchParams()
  const code = searchParams.get('code')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [checkingInvite, setCheckingInvite] = useState(true)
  const [organizationName, setOrganizationName] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' })

  useEffect(() => {
    if (!code) {
      setCheckingInvite(false)
      return
    }
    fetch(`/api/auth/register?code=${encodeURIComponent(code)}`)
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => setOrganizationName(ok ? data.organizationName : null))
      .catch(() => setOrganizationName(null))
      .finally(() => setCheckingInvite(false))
  }, [code])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.password !== form.confirmPassword) {
      toast.error(t('login.passwordsDontMatch'))
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, phone: form.phone, password: form.password, code }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || t('login.somethingWrong'))
        return
      }
      setSubmitted(true)
    } catch {
      toast.error(t('login.somethingWrong'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="edvuno-auth min-h-screen flex items-center justify-center bg-[#f4fbf6] relative overflow-hidden py-10">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl" />
      </div>
      <div className="absolute inset-0 bg-[url('/brand/brand-pattern.svg')] bg-cover bg-center opacity-[.08]" />

      <div className="max-w-md w-full relative z-10">
        <div className="flex justify-end mb-4">
          <LanguageToggle className="!bg-white !border-[#cfe9da] !text-[#166B55] hover:!bg-[#ddf8e9]" />
        </div>
        <div className="bg-white border border-[#cfe9da] rounded-2xl p-8 shadow-[0_24px_70px_-45px_#166B55]">
          <div className="text-center mb-8">
            <img src="/brand/brand-logo-light.svg" alt="EDVUNO" className="mx-auto mb-5 h-auto w-32" />
            <h1 className="text-2xl font-bold text-white tracking-tight">{t('login.registerTitle')}</h1>
            <p className="text-slate-400 mt-1 text-sm">
              {organizationName ? `${t('login.registerJoining')} ${organizationName}` : t('login.registerSubtitle')}
            </p>
          </div>

          {checkingInvite ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          ) : !code || !organizationName ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-500/10 rounded-2xl mb-1">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <p className="text-sm font-medium text-white">{t('login.registerInviteInvalidTitle')}</p>
              <p className="text-sm text-slate-400">
                {code ? t('login.registerInviteInvalidMessage') : t('login.registerInviteMissingMessage')}
              </p>
              <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300">
                <ArrowLeft className="w-4 h-4" /> {t('login.backToSignIn')}
              </Link>
            </div>
          ) : submitted ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-slate-300">{t('login.registerPendingMessage')}</p>
              <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300">
                <ArrowLeft className="w-4 h-4" /> {t('login.backToSignIn')}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('login.fullName')}</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('login.email')}</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('login.phoneOptional')}</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('login.password')}</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('login.confirmPassword')}</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white py-3 rounded-xl font-semibold hover:from-indigo-500 hover:to-violet-500 focus:ring-4 focus:ring-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm shadow-lg shadow-indigo-500/25"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('login.createAccount')}
              </button>

              <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm text-slate-400 hover:text-slate-300">
                <ArrowLeft className="w-4 h-4" /> {t('login.backToSignIn')}
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
