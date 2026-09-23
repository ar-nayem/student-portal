'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useFeatures } from '@/src/lib/FeaturesContext'
import { useLanguage } from '@/src/lib/i18n/LanguageContext'
import OwnerResources from './OwnerResources'
import AdminResources from './AdminResources'

// One Resources entry for both sides: a company's Developer (owner) manages,
// an admin only sees what was shared with them. While a SUPER_DEVELOPER is
// impersonating a company, session.user.role reads OWNER, so they land on the
// management view for that company.
export default function ResourcesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { t } = useLanguage()
  const { has, loaded } = useFeatures()

  const role = session?.user?.role
  const allowed = role === 'OWNER' || role === 'ADMIN'
  const enabled = loaded && has('shared_resources')

  useEffect(() => {
    if (status === 'loading' || !loaded) return
    if (!allowed || !enabled) router.replace('/dashboard')
  }, [status, loaded, allowed, enabled, router])

  if (status === 'loading' || !loaded || !allowed || !enabled) {
    return <div className="p-8 text-center">{t('common.loading')}</div>
  }

  return role === 'OWNER' ? <OwnerResources /> : <AdminResources />
}
