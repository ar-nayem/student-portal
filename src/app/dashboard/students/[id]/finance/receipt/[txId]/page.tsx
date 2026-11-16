'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Printer, Building2, User as UserIcon, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/src/lib/i18n/LanguageContext'
import { formatMoney } from '@/src/lib/money'
import { CATEGORY_KEYS, PAYMENT_METHOD_KEYS, STATUS_KEYS } from '@/src/components/TransactionFormModal'

type ReceiptStyle = 'organization' | 'personal' | 'minimal'

export default function ReceiptPage() {
  const { id, txId } = useParams()
  const studentId = id as string
  const router = useRouter()
  const { t, formatDate } = useLanguage()

  const [tx, setTx] = useState<any>(null)
  const [org, setOrg] = useState<any>(null)
  const [paidToDate, setPaidToDate] = useState(0)
  const [loading, setLoading] = useState(true)
  const [style, setStyle] = useState<ReceiptStyle>('organization')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [txRes, orgRes] = await Promise.all([
          fetch(`/api/transactions/${txId}`, { credentials: 'include' }),
          fetch('/api/organization?owner=true', { credentials: 'include' }),
        ])
        if (!txRes.ok) throw new Error()
        const txData = await txRes.json()
        setTx(txData)
        if (orgRes.ok) setOrg(await orgRes.json())

        if (txData.canViewStudent) {
          const allTxRes = await fetch(`/api/transactions?studentId=${txData.studentId}`, { credentials: 'include' })
          if (allTxRes.ok) {
            const allTx = await allTxRes.json()
            const paid = Array.isArray(allTx)
              ? allTx.filter((t: any) => t.type === 'INCOME' && t.status === 'COMPLETED').reduce((sum: number, t: any) => sum + t.amount, 0)
              : 0
            setPaidToDate(paid)
          }
        }
      } catch {
        toast.error(t('finance.receiptLoadFailed'))
        router.replace(`/dashboard/students/${studentId}/finance`)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [txId])

  const receiptNumber = useMemo(() => tx ? `RCP-${(tx.id as string).slice(0, 8).toUpperCase()}` : '', [tx])

  if (loading) return <div className="p-10 text-center text-muted-foreground">{t('common.loading')}</div>
  if (!tx) return null

  const creator = tx.createdBy
  const brand = style === 'organization'
    ? { name: org?.name || t('finance.receiptOrgFallbackName'), logo: org?.logo, email: org?.email, phone: org?.phone, wechat: org?.wechat, address: org?.address, website: org?.website }
    : style === 'personal'
    ? { name: creator?.name, logo: creator?.avatar, email: creator?.email, phone: creator?.phone, wechat: creator?.wechat, address: null, website: null }
    : null

  return (
    <div className="max-w-3xl mx-auto">
      <div className="no-print flex flex-wrap items-center gap-3 mb-6">
        <Link href={tx.canViewStudent ? `/dashboard/students/${tx.studentId}/finance` : '/dashboard/finance'} className="text-muted-foreground hover:text-foreground p-2 rounded-xl hover:bg-muted transition-colors shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold text-foreground tracking-tight flex-1 min-w-[200px]">{t('finance.receiptTitle')}</h1>

        <div className="flex items-center bg-muted rounded-xl p-1 gap-1">
          <button
            onClick={() => setStyle('organization')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${style === 'organization' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Building2 className="w-3.5 h-3.5" /> {t('finance.receiptStyleOrg')}
          </button>
          <button
            onClick={() => setStyle('personal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${style === 'personal' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <UserIcon className="w-3.5 h-3.5" /> {t('finance.receiptStylePersonal')}
          </button>
          <button
            onClick={() => setStyle('minimal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${style === 'minimal' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <FileText className="w-3.5 h-3.5" /> {t('finance.receiptStyleMinimal')}
          </button>
        </div>

        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition flex items-center gap-2 text-sm font-medium shadow-sm shadow-indigo-500/20"
        >
          <Printer className="w-4 h-4" /> {t('finance.receiptPrint')}
        </button>
      </div>

      {/* The printable document itself always renders on a white sheet, independent of app theme/dark mode */}
      <div className="bg-white text-slate-900 rounded-2xl shadow-sm border border-slate-200 p-8 sm:p-10 print:shadow-none print:border-0 print:rounded-none">
        {style !== 'minimal' && brand && (
          <div className={`flex items-start justify-between gap-6 pb-6 mb-6 border-b-2 ${style === 'organization' ? 'border-indigo-600' : 'border-slate-800'}`}>
            <div className="flex items-center gap-4 min-w-0">
              {brand.logo ? (
                <img src={brand.logo} alt="" className="w-14 h-14 rounded-lg object-contain border border-slate-200 shrink-0" />
              ) : (
                <div className={`w-14 h-14 rounded-lg flex items-center justify-center shrink-0 text-white font-bold text-lg ${style === 'organization' ? 'bg-indigo-600' : 'bg-slate-800'}`}>
                  {(brand.name || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-lg font-bold truncate">{brand.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {[brand.email, brand.phone, brand.wechat && `WeChat: ${brand.wechat}`].filter(Boolean).join('  ·  ')}
                </p>
                {(brand.address || brand.website) && (
                  <p className="text-xs text-slate-500">{[brand.address, brand.website].filter(Boolean).join('  ·  ')}</p>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-2xl font-black tracking-tight ${style === 'organization' ? 'text-indigo-600' : 'text-slate-800'}`}>{t('finance.receiptHeadline')}</p>
              <p className="text-xs text-slate-500 mt-1">{receiptNumber}</p>
            </div>
          </div>
        )}

        {style === 'minimal' && (
          <div className="flex items-baseline justify-between pb-4 mb-6 border-b border-slate-300">
            <p className="text-xl font-bold tracking-tight">{t('finance.receiptHeadline')}</p>
            <p className="text-xs text-slate-500">{receiptNumber}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">{t('finance.receiptBilledTo')}</p>
            <p className="font-semibold">{tx.student.fullName}</p>
            {tx.student.serialNumber && <p className="text-slate-500 text-xs mt-0.5">{t('finance.receiptSerial')}: {tx.student.serialNumber}</p>}
            {tx.student.passportNo && <p className="text-slate-500 text-xs">{t('finance.receiptPassport')}: {tx.student.passportNo}</p>}
            {tx.student.mainEmail && <p className="text-slate-500 text-xs">{tx.student.mainEmail}</p>}
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">{t('finance.receiptDate')}</p>
            <p className="font-semibold">{formatDate(tx.transactionDate, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-3 mb-1">{t('finance.receiptIssuedBy')}</p>
            <p className="font-semibold">{creator?.name}</p>
          </div>
        </div>

        <table className="w-full text-sm mb-8">
          <thead>
            <tr className="border-b-2 border-slate-800">
              <th className="text-left py-2 font-bold uppercase text-[11px] tracking-wider text-slate-500">{t('finance.receiptDescription')}</th>
              <th className="text-left py-2 font-bold uppercase text-[11px] tracking-wider text-slate-500">{t('finance.paymentMethod')}</th>
              <th className="text-right py-2 font-bold uppercase text-[11px] tracking-wider text-slate-500">{t('finance.amount')}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="py-4 pr-4">
                <p className="font-medium">{t(`finance.${CATEGORY_KEYS[tx.category]}`)}</p>
                {tx.description && <p className="text-xs text-slate-500 mt-0.5">{tx.description}</p>}
              </td>
              <td className="py-4 text-slate-600">{tx.paymentMethod ? t(`finance.${PAYMENT_METHOD_KEYS[tx.paymentMethod]}`) : '-'}</td>
              <td className="py-4 text-right font-semibold whitespace-nowrap">{formatMoney(tx.amount, tx.currency)}</td>
            </tr>
          </tbody>
        </table>

        <div className="flex justify-end mb-10">
          <div className="w-full max-w-[280px]">
            <div className="flex justify-between py-2 border-t-2 border-slate-800">
              <p className="font-bold">{t('finance.receiptTotal')}</p>
              <p className="font-bold text-lg">{formatMoney(tx.amount, tx.currency)}</p>
            </div>
            <div className="flex justify-between mt-2">
              <p className="text-xs text-slate-500">{t('finance.status')}</p>
              <span className={`text-xs font-bold uppercase tracking-wider ${tx.status === 'COMPLETED' ? 'text-emerald-600' : tx.status === 'PENDING' ? 'text-amber-600' : 'text-slate-500'}`}>
                {t(`finance.${STATUS_KEYS[tx.status]}`)}
              </span>
            </div>
          </div>
        </div>

        {typeof tx.student.totalFee === 'number' && (
          <div className="bg-slate-50 rounded-xl p-4 mb-10 -mt-6">
            <div className="flex justify-between text-sm py-1">
              <p className="text-slate-500">{t('finance.receiptTotalFee')}</p>
              <p className="font-medium">{formatMoney(tx.student.totalFee, tx.currency)}</p>
            </div>
            <div className="flex justify-between text-sm py-1">
              <p className="text-slate-500">{t('finance.receiptPaidToDate')}</p>
              <p className="font-medium">{formatMoney(paidToDate, tx.currency)}</p>
            </div>
            <div className="flex justify-between text-sm py-1 pt-2 mt-1 border-t border-slate-200">
              <p className="font-bold">{t('finance.receiptAmountDue')}</p>
              {tx.student.totalFee - paidToDate <= 0 ? (
                <p className="font-bold text-emerald-600">{t('finance.fullyPaid')}</p>
              ) : (
                <p className="font-bold text-rose-600">{formatMoney(tx.student.totalFee - paidToDate, tx.currency)}</p>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-slate-400 text-center pt-6 border-t border-slate-200">
          {t('finance.receiptFooter')}
        </p>
      </div>
    </div>
  )
}
