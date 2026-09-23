'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { FileText, Link2, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/src/lib/i18n/LanguageContext'

interface GrantedResource {
  id: string
  title: string
  description: string | null
  kind: 'FILE' | 'LINK'
  originalName: string | null
  mimeType: string | null
  size: number | null
  grantedAt: string
}

export default function AdminResourcesPage() {
  const { data: session, status } = useSession()
  const { t } = useLanguage()
  const [resources, setResources] = useState<GrantedResource[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'loading' || !session) return
    fetch('/api/resources')
      .then((res) => {
        if (!res.ok) throw new Error()
        return res.json()
      })
      .then(setResources)
      .catch(() => toast.error(t('resources.loadFailed')))
      .finally(() => setLoading(false))
  }, [session, status])

  if (!session || loading) return <div className="p-8 text-center">{t('common.loading')}</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('resources.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('resources.subtitle')}</p>
      </div>

      <div className="bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden">
        {resources.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">{t('resources.noResources')}</div>
        ) : (
          <div className="divide-y divide-border">
            {resources.map((r) => (
              <div key={r.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    {r.kind === 'FILE' ? <FileText className="w-4 h-4 text-indigo-600" /> : <Link2 className="w-4 h-4 text-indigo-600" />}
                    {r.title}
                  </div>
                  {r.description && <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>}
                </div>
                <a
                  href={`/api/resources/${r.id}/open`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition inline-flex items-center gap-1.5 shrink-0"
                >
                  <Download className="w-3.5 h-3.5" /> {r.kind === 'FILE' ? t('common.download') : t('resources.open')}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
