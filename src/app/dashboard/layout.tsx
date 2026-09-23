'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import {
  LayoutDashboard, Users, UserPlus, FileText,
  Settings, LogOut, Shield, GraduationCap, MessageSquare,
  ListChecks, Menu, X, Wallet, Globe, BarChart3, Megaphone, Bell,
  Building2, LogIn, ListTodo, ChevronLeft, ChevronRight, Package, CreditCard, FolderOpen
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/src/lib/i18n/LanguageContext'
import { useFeatures } from '@/src/lib/FeaturesContext'
import { LanguageToggle } from '@/src/components/LanguageToggle'
import { ThemeToggle } from '@/src/components/ThemeToggle'

interface OrgData {
  name: string
  logo: string | null
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: session, update } = useSession()
  const { t } = useLanguage()
  const { has: hasFeature } = useFeatures()
  const role = session?.user?.role
  const isAdmin = role === 'ADMIN' || role === 'OWNER'
  const isOwner = role === 'OWNER'
  const isImpersonating = !!session?.user?.impersonatingOrgId
  // role is the *effective* role (OWNER while impersonating — see auth.ts's
  // session callback), so this only fires for a genuine platform operator
  // with no org context of their own.
  const isSuperDeveloper = role === 'SUPER_DEVELOPER'

  // Neutral until the real org's branding loads — never another org's name,
  // even for the split second before the client-side fetch below resolves.
  const [ownerOrg, setOwnerOrg] = useState<OrgData>({ name: 'Student Portal', logo: null })
  const [userOrg, setUserOrg] = useState<OrgData>({ name: 'Student Portal', logo: null })
  const [myAvatar, setMyAvatar] = useState<string | null>(null)
  const [myProfile, setMyProfile] = useState<{ name: string; email: string; canViewPortals: boolean } | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  // Subscription/trial state. Null until checked — the dashboard renders
  // normally in the meantime rather than flashing a lockout screen at
  // everyone on every page load.
  const [accessState, setAccessState] = useState<{
    state: string; organizationName?: string; isTrial?: boolean
    accessExpiresAt?: string | null; daysLeft?: number | null; suspendedReason?: string | null
  } | null>(null)
  const [exitingImpersonation, setExitingImpersonation] = useState(false)
  // Desktop-only icon-rail mode. Persisted so it survives navigation/reload;
  // read from localStorage after mount to avoid an SSR/client markup mismatch.
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setCollapsed(localStorage.getItem('sidebarCollapsed') === '1')
  }, [])

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem('sidebarCollapsed', next ? '1' : '0')
      return next
    })
  }

  async function exitImpersonation() {
    setExitingImpersonation(true)
    try {
      const res = await fetch('/api/platform/impersonate/exit', { method: 'POST', credentials: 'include' })
      if (res.ok) {
        await update({ impersonatingOrgId: null })
        window.location.href = '/dashboard/platform'
      } else {
        toast.error(t('platform.exitFailed'))
        setExitingImpersonation(false)
      }
    } catch {
      toast.error(t('platform.exitFailed'))
      setExitingImpersonation(false)
    }
  }

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Deliberately its own endpoint, not /api/profile: every org-scoped route
  // (profile included) stops answering once access lapses, so the check that
  // explains the lockout has to sit outside that gate.
  useEffect(() => {
    if (!session?.user?.id) return
    fetch('/api/organization/access', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setAccessState(data))
      .catch(() => {})
  }, [session?.user?.id, session?.user?.impersonatingOrgId])

  useEffect(() => {
    // A genuine (non-impersonating) platform operator has no org of their
    // own — skip the org-branding fetch entirely rather than showing a
    // fallback that looks like one specific tenant's name.
    if (isSuperDeveloper) {
      setOwnerOrg({ name: t('platform.title'), logo: null })
      return
    }
    // Fetch owner's org for company branding
    fetch('/api/organization?owner=true', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data) {
          setOwnerOrg({ name: data.name || 'Student Portal', logo: data.logo || null })
        }
      })
      .catch(() => {})

    // Fetch current user's org for their own avatar/logo
    if (session?.user?.id) {
      fetch(`/api/organization?userId=${session.user.id}`, { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
          if (data) {
            setUserOrg({ name: data.name || session?.user?.name || 'User', logo: data.logo || null })
          }
        })
        .catch(() => {})

      // Personal profile picture + live name/email (session JWT can go stale if these change after login)
      fetch('/api/profile', { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
          setMyAvatar(data?.profile?.avatar || null)
          if (data?.profile) {
            setMyProfile({ name: data.profile.name, email: data.profile.email, canViewPortals: !!data.profile.canViewPortals })
          }
        })
        .catch(() => {})
    }
  }, [session?.user?.id, session?.user?.impersonatingOrgId, isSuperDeveloper])

  // Feature gating by the org's Package (see src/lib/features.ts), set by the
  // super developer, resolved once in FeaturesProvider. An org with no
  // package assigned is unrestricted, so every item shows.
  type NavItem = { label: string; href: string; icon: typeof LayoutDashboard }
  const keep = (items: (NavItem | false)[]) => items.filter(Boolean) as NavItem[]

  const baseNav = keep([
    hasFeature('messages') && { label: t('nav.messages'), href: '/dashboard/messages', icon: MessageSquare },
    { label: t('nav.settings'), href: '/dashboard/profile', icon: Settings },
  ])

  const adminNav = isAdmin ? keep([
    { label: t('nav.dashboard'), href: '/dashboard/admin', icon: LayoutDashboard },
    { label: t('nav.allStudents'), href: '/dashboard/students', icon: Users },
    hasFeature('student_create') && { label: t('nav.addStudent'), href: '/dashboard/students/new', icon: UserPlus },
    hasFeature('finance') && { label: t('nav.finance'), href: '/dashboard/finance', icon: Wallet },
    hasFeature('tasks') && { label: t('nav.tasks'), href: '/dashboard/tasks', icon: ListTodo },
    hasFeature('offers') && { label: 'Offers', href: '/dashboard/offers', icon: Megaphone },
    hasFeature('universities') && { label: t('nav.universities'), href: '/dashboard/universities', icon: GraduationCap },
    hasFeature('shared_resources') && { label: t('resources.title'), href: '/dashboard/resources', icon: FolderOpen },
  ]) : keep([
    { label: t('nav.dashboard'), href: '/dashboard/agent', icon: LayoutDashboard },
    { label: t('nav.myStudents'), href: '/dashboard/students', icon: Users },
    hasFeature('student_create') && { label: t('nav.addStudent'), href: '/dashboard/students/new', icon: UserPlus },
    hasFeature('finance') && { label: t('nav.finance'), href: '/dashboard/finance', icon: Wallet },
  ])

  const ownerNav = isOwner ? keep([
    hasFeature('manage_accounts') && { label: t('nav.manageAccounts'), href: '/dashboard/agents', icon: Shield },
    hasFeature('document_requirements') && { label: t('nav.docRequirements'), href: '/dashboard/document-requirements', icon: FileText },
    hasFeature('field_requirements') && { label: t('nav.fieldRequirements'), href: '/dashboard/field-requirements', icon: ListChecks },
    hasFeature('visitor_analytics') && { label: t('nav.analytics'), href: '/dashboard/analytics', icon: BarChart3 },
    hasFeature('alert_settings') && { label: 'Alert Settings', href: '/dashboard/admin/alerts', icon: Bell },
  ]) : []

  // Owner always has access; an admin needs the per-account grant the owner
  // toggles from Manage Accounts (session role alone doesn't carry that flag).
  const canViewPortals = (isOwner || (role === 'ADMIN' && !!myProfile?.canViewPortals)) && hasFeature('university_portals')
  const portalsNav = canViewPortals ? [
    { label: t('nav.portals'), href: '/dashboard/portals', icon: Globe },
  ] : []

  const platformNav = isSuperDeveloper ? [
    { label: t('platform.title'), href: '/dashboard/platform', icon: Building2 },
    { label: t('packages.title'), href: '/dashboard/platform/packages', icon: Package },
    { label: t('billing.title'), href: '/dashboard/platform/billing', icon: CreditCard },
    // Platform-wide analytics: the same page an org owner sees, but the API
    // returns every organization's traffic for a non-impersonating operator.
    { label: t('nav.analytics'), href: '/dashboard/analytics', icon: BarChart3 },
    { label: t('campaigns.title'), href: '/dashboard/platform/campaigns', icon: Megaphone },
  ] : []

  const navItems = isSuperDeveloper
    ? [...platformNav, { label: t('nav.settings'), href: '/dashboard/profile', icon: Settings }]
    : [...adminNav, ...portalsNav, ...ownerNav, ...baseNav]

  // A lapsed or suspended organization gets a plain explanation instead of a
  // dashboard whose every request fails. Sign out stays reachable so a user
  // with a second account isn't stranded here.
  const locked = accessState && (accessState.state === 'EXPIRED' || accessState.state === 'SUSPENDED')
  if (locked) {
    const isExpired = accessState.state === 'EXPIRED'
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center mx-auto">
            <Bell className="w-7 h-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight">
            {isExpired
              ? (accessState.isTrial ? t('access.trialEnded') : t('access.subscriptionEnded'))
              : t('access.suspendedTitle')}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            {isExpired ? t('access.expiredBody') : (accessState.suspendedReason || t('access.suspendedBody'))}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            {t('access.contactUs')}{' '}
            <a href="mailto:arltd023@gmail.com" className="text-indigo-600 dark:text-indigo-400 hover:underline">
              arltd023@gmail.com
            </a>
          </p>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="mt-7 px-5 py-2.5 rounded-xl border border-border font-medium text-sm hover:bg-muted transition"
          >
            {t('nav.signOut')}
          </button>
        </div>
      </div>
    )
  }

  // Gentle heads-up while access is still valid but running out.
  const expiringSoon = accessState?.state === 'OK'
    && typeof accessState.daysLeft === 'number'
    && accessState.daysLeft <= 7

  return (
    <div className="min-h-screen bg-background">
      {expiringSoon && (
        <div className="no-print sticky top-0 z-50 bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium flex-wrap">
          <Bell className="w-4 h-4 shrink-0" />
          <span>
            {(accessState.isTrial ? t('access.trialBanner') : t('access.renewBanner'))
              .replace('{n}', String(accessState.daysLeft))}
          </span>
        </div>
      )}
      {isImpersonating && (
        <div className="no-print sticky top-0 z-50 bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-center gap-3 text-sm font-medium flex-wrap">
          <LogIn className="w-4 h-4 shrink-0" />
          <span>{t('platform.impersonatingBanner').replace('{org}', ownerOrg.name)}</span>
          <button
            onClick={exitImpersonation}
            disabled={exitingImpersonation}
            className="px-2.5 py-0.5 bg-amber-950/10 hover:bg-amber-950/20 rounded-lg font-semibold transition disabled:opacity-50"
          >
            {t('platform.exitImpersonation')}
          </button>
        </div>
      )}
      {/* Mobile top bar */}
      <div className="no-print lg:hidden sticky top-0 z-20 bg-card border-b border-border px-4 py-3 flex items-center justify-between gap-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="font-bold text-foreground text-sm truncate">{ownerOrg.name}</span>
        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle />
          <LanguageToggle />
        </div>
      </div>

      <div className="flex">
        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-30 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`no-print w-64 ${collapsed ? 'lg:w-20' : 'lg:w-64'} bg-card border-r border-border fixed inset-y-0 left-0 z-40 flex flex-col shadow-sm transform transition-all duration-200 ease-in-out lg:translate-x-0 ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Collapse toggle - desktop only */}
          <button
            onClick={toggleCollapsed}
            title={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            className="hidden lg:flex items-center justify-center w-6 h-6 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors absolute -right-3 top-8 z-10 shadow-sm"
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>

          {/* Company Logo - Owner's branding */}
          <div className={`p-5 border-b border-border shrink-0 ${collapsed ? 'lg:px-3' : ''}`}>
            <div className={`flex items-center gap-2 ${collapsed ? 'lg:justify-center' : 'justify-between'}`}>
              <Link href="/dashboard" className={`flex items-center gap-3 group min-w-0 ${collapsed ? 'lg:justify-center' : ''}`}>
                {ownerOrg.logo ? (
                  <div className="w-10 h-10 rounded-xl overflow-hidden border border-border bg-card flex items-center justify-center shrink-0">
                    <img src={ownerOrg.logo} alt="Logo" className="w-full h-full object-contain p-0.5" />
                  </div>
                ) : (
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow shrink-0">
                    <GraduationCap className="w-6 h-6 text-white" />
                  </div>
                )}
                <div className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
                  <h1 className="font-bold text-foreground text-lg tracking-tight truncate">{ownerOrg.name}</h1>
                  <p className="text-[11px] text-muted-foreground font-medium tracking-wider uppercase">{t('nav.studentPortal')}</p>
                </div>
              </Link>
              <button
                onClick={() => setMobileOpen(false)}
                className="lg:hidden p-1.5 rounded-lg text-muted-foreground hover:bg-muted shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className={`mt-3 flex items-center gap-2 ${collapsed ? 'lg:flex-col' : ''}`}>
              <LanguageToggle className={`flex-1 justify-center ${collapsed ? 'lg:hidden' : ''}`} />
              <LanguageToggle iconOnly className={collapsed ? 'hidden lg:flex' : 'hidden'} />
              <ThemeToggle />
            </div>
          </div>

          {/* Nav */}
          <nav className="px-3 py-4 space-y-0.5 flex-1 min-h-0 overflow-y-auto">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${collapsed ? 'lg:justify-center' : ''} ${
                    isActive
                      ? 'bg-primary/10 text-primary shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <item.icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className={collapsed ? 'lg:hidden' : ''}>{item.label}</span>
                </Link>
              )
            })}
          </nav>

          {/* User section - avatar + name */}
          <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-border shrink-0">
            <div className={`flex items-center gap-3 mb-3 px-3 ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}>
              {(myAvatar || userOrg.logo) ? (
                <div className="w-10 h-10 rounded-xl overflow-hidden border border-border bg-card flex items-center justify-center shrink-0">
                  <img src={myAvatar || userOrg.logo || ''} alt="Avatar" className={`w-full h-full ${myAvatar ? 'object-cover' : 'object-contain p-0.5'}`} />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                  {(myProfile?.name || session?.user?.name)?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
              <div className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
                <p className="text-sm font-semibold text-foreground truncate">{myProfile?.name || session?.user?.name}</p>
                <p className="text-xs text-muted-foreground truncate">{myProfile?.email || session?.user?.email}</p>
              </div>
            </div>
            <div className={`px-3 mb-3 ${collapsed ? 'lg:hidden' : ''}`}>
              <span className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                isSuperDeveloper ? 'bg-slate-800 text-slate-100 dark:bg-slate-200 dark:text-slate-900' :
                role === 'OWNER' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' :
                isAdmin ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400' :
                'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
              }`}>
                {isSuperDeveloper ? t('common.roleSuperDeveloper') : role === 'OWNER' ? t('common.roleOwner') : isAdmin ? t('common.roleAdmin') : t('common.roleAgent')}
              </span>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              title={collapsed ? t('nav.signOut') : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 w-full text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground rounded-xl transition-all duration-200 ${collapsed ? 'lg:justify-center' : ''}`}
            >
              <LogOut className="w-[18px] h-[18px] shrink-0" />
              <span className={collapsed ? 'lg:hidden' : ''}>{t('nav.signOut')}</span>
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className={`print:m-0 print:p-0 flex-1 ${collapsed ? 'lg:ml-20' : 'lg:ml-64'} p-4 sm:p-6 lg:p-8 min-w-0 transition-all duration-200`}>
          {children}
        </main>
      </div>
    </div>
  )
}