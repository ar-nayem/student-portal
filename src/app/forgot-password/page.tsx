'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/src/lib/i18n/LanguageContext'
import { LanguageToggle } from '@/src/components/LanguageToggle'

export default function ForgotPasswordPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  async function sendCode() {
    setLoading(true)
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setStep('code')
      toast.success(t('login.codeSentMessage'))
    } catch {
      toast.error(t('login.somethingWrong'))
    } finally {
      setLoading(false)
    }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirmPassword) {
      toast.error(t('login.passwordsDontMatch'))
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token: code, newPassword: password }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || t('login.somethingWrong'))
        return
      }
      toast.success(t('login.passwordResetSuccess'))
      router.push('/login')
    } catch {
      toast.error(t('login.somethingWrong'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="edvuno-auth min-h-screen flex items-center justify-center bg-[#f4fbf6] relative overflow-hidden">
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
            <h1 className="text-2xl font-bold text-white tracking-tight">{t('login.forgotPasswordTitle')}</h1>
            <p className="text-slate-400 mt-1 text-sm">
              {step === 'email' ? t('login.forgotPasswordSubtitle') : t('login.enterCodeSubtitle')}
            </p>
          </div>

          {step === 'email' ? (
            <form onSubmit={(e) => { e.preventDefault(); sendCode() }} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('login.email')}</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm"
                  placeholder={t('login.emailPlaceholder')}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white py-3 rounded-xl font-semibold hover:from-indigo-500 hover:to-violet-500 focus:ring-4 focus:ring-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm shadow-lg shadow-indigo-500/25"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('login.sendResetLink')}
              </button>

              <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm text-slate-400 hover:text-slate-300">
                <ArrowLeft className="w-4 h-4" /> {t('login.backToSignIn')}
              </Link>
            </form>
          ) : (
            <form onSubmit={submitReset} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('login.verificationCode')}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-center text-2xl tracking-[0.5em] font-mono"
                  placeholder="000000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('login.newPassword')}</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('login.confirmPassword')}</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white py-3 rounded-xl font-semibold hover:from-indigo-500 hover:to-violet-500 focus:ring-4 focus:ring-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm shadow-lg shadow-indigo-500/25"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('login.resetPassword')}
              </button>

              <div className="flex items-center justify-between text-sm">
                <button type="button" onClick={() => setStep('email')} className="text-slate-400 hover:text-slate-300 flex items-center gap-1.5">
                  <ArrowLeft className="w-4 h-4" /> {t('login.changeEmail')}
                </button>
                <button type="button" onClick={sendCode} disabled={loading} className="text-indigo-400 hover:text-indigo-300">
                  {t('login.resendCode')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
