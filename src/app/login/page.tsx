'use client'

import { useState } from 'react'
import Image from 'next/image'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/src/lib/i18n/LanguageContext'
import { LanguageToggle } from '@/src/components/LanguageToggle'

export default function LoginPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await signIn('credentials', { email, password, redirect: false })
      if (result?.error) toast.error(t('login.invalidCredentials'))
      else { toast.success(t('login.welcomeBack')); router.push('/dashboard'); router.refresh() }
    } catch { toast.error(t('login.somethingWrong')) }
    finally { setLoading(false) }
  }

  return <main className="edvuno-login min-h-screen grid lg:grid-cols-[minmax(0,1.06fr)_minmax(420px,.94fr)] bg-[#f4fbf6] text-[#0c382d]">
    <section className="relative hidden lg:flex min-h-screen flex-col justify-between overflow-hidden bg-[#0b4939] p-10 xl:p-14" aria-label="EDVUNO brand artwork">
      <Image src="/brand/graduates.jpg" alt="Graduates celebrating together on campus" fill priority sizes="(min-width:1024px) 55vw, 100vw" className="object-cover object-center" /><div className="absolute inset-0 bg-gradient-to-b from-[#042b24]/65 via-[#064536]/20 to-[#031f1a]/85" />
      <div className="relative z-10 flex items-start justify-between gap-5"><span className="rounded-full border border-white/40 bg-[#043a30]/55 px-4 py-2 text-xs font-semibold tracking-wide text-white backdrop-blur-sm">EDVUNO PORTAL</span><a href="https://edvuno.top" className="rounded-full border border-white/40 bg-[#043a30]/55 px-4 py-2 text-xs font-semibold text-white backdrop-blur-sm hover:bg-[#043a30]/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#166B55]">Visit website ↗</a></div>
      <div className="relative z-10 max-w-lg border-l border-[#65CDA5] pl-6 text-white"><p className="text-3xl font-semibold leading-tight tracking-tight">Your Future.<br /><span className="text-[#65CDA5]">Beyond Borders.</span></p><p className="mt-3 text-sm leading-relaxed text-[#dcf7e9]">A focused place for student journeys and EDVUNO content.</p></div>
    </section>
    <section className="relative flex min-h-screen flex-col justify-start lg:justify-center overflow-hidden px-5 py-8 sm:px-10 lg:px-14 xl:px-20">
      <div className="pointer-events-none absolute -bottom-28 -right-36 h-96 w-96 opacity-20" style={{ background: 'url(/brand/brand-pattern.svg) center/contain no-repeat' }} />
      <div className="relative mx-auto w-full max-w-[440px]">
        <div className="mb-12 flex items-start justify-between gap-4"><a href="https://edvuno.top" aria-label="EDVUNO website" className="inline-flex"><Image src="/brand/brand-logo-dark.svg" alt="EDVUNO" width={178} height={90} priority className="h-auto w-[150px] sm:w-[178px]" /></a><LanguageToggle className="!border-[#bfe8d1] !bg-white !text-[#166B55]" /></div>
        <div className="mb-8"><p className="mb-3 text-xs font-semibold uppercase tracking-[.17em] text-[#166B55]">EDVUNO PORTAL</p><h1 className="text-4xl font-semibold tracking-tight sm:text-[42px]">Welcome back.</h1><p className="mt-3 text-[15px] leading-relaxed text-[#4d6f61]">Sign in to continue to your dashboard.</p></div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div><label htmlFor="login-email" className="mb-2 block text-sm font-semibold">{t('login.emailOrUsername')}</label><input id="login-email" type="text" autoComplete="username" required autoCapitalize="none" autoCorrect="off" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('login.emailPlaceholder')} className="w-full rounded-xl border border-[#b9dcc9] bg-white px-4 py-3.5 text-[#0c382d] outline-none transition focus:border-[#166B55] focus:ring-2 focus:ring-[#65CDA5]/40" /></div>
          <div><div className="mb-2 flex items-center justify-between gap-2"><label htmlFor="login-password" className="text-sm font-semibold">{t('login.password')}</label><Link href="/forgot-password" className="text-sm font-medium text-[#166B55] underline-offset-4 hover:underline">{t('login.forgotPassword')}</Link></div><input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder={t('login.passwordPlaceholder')} className="w-full rounded-xl border border-[#b9dcc9] bg-white px-4 py-3.5 text-[#0c382d] outline-none transition focus:border-[#166B55] focus:ring-2 focus:ring-[#65CDA5]/40" /></div>
          <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#166B55] px-5 py-3.5 font-semibold text-white shadow-[0_10px_24px_-15px_#166B55] transition hover:bg-[#0e5744] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#166B55] disabled:cursor-wait disabled:opacity-60">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}{loading ? t('login.signingIn') : t('login.signIn')}</button>
        </form>
        <p className="mt-7 text-center text-sm text-[#4d6f61]">{t('login.noAccount')} <Link href="/register" className="font-semibold text-[#166B55] underline-offset-4 hover:underline">{t('login.registerAsAgent')}</Link></p>
        <div className="mt-14 border-t border-[#cce8d7] pt-5 text-center text-xs text-[#587969]">Your Future. Beyond Borders. · <a href="https://edvuno.top" className="underline-offset-4 hover:underline">edvuno.top</a></div>
      </div>
    </section>
  </main>
}
