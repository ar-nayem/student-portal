'use client'


import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Save, Loader2, Upload, FileText, Image, Video, X, Plus, Trash2, FileImage } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/src/lib/i18n/LanguageContext'
import { useFeatures } from '@/src/lib/FeaturesContext'
import { useSession } from 'next-auth/react'
import { StudentAgentSelect, useAssignableAgents } from '@/src/components/StudentAssignmentForm'

interface EducationItem {
  degree: string
  schoolName: string
  yearFrom: string
  yearTo: string
  contactPerson: string
}

interface WorkItem {
  yearFrom: string
  yearTo: string
  company: string
  occupation: string
  reference: string
  phone: string
  email: string
}

interface FamilyItem {
  name: string
  relationship: string
  nationality: string
  employer: string
  occupation: string
  phone: string
  email: string
}

interface SponsorItem {
  name: string
  relationship: string
  nationality: string
  employer: string
  occupation: string
  phone: string
  email: string
}

export interface DocCategory {
  key: string
  label: string
  description?: string
  accept: string
  type: string
  maxSize?: string
  isRequired: boolean
}

export interface FieldReq {
  key: string
  label: string
  section: string
  isRequired: boolean
}

interface PendingDoc {
  file: File
  category: DocCategory
}

export interface StudentApplicationFormProps {
  mode: 'staff' | 'public'
  endpoints: { createStudent: string; uploadDocument: string; documentRequirements?: string; fieldRequirements?: string }
  initialDocCategories?: DocCategory[]
  initialFieldRequirements?: FieldReq[]
  onSuccess: (result: { id: string; serialNumber?: string; uploadedCount?: number }) => void
}

function YearMonthDayInput({ label, required, year, month, day, onChange }: {
  label: string
  required?: boolean
  year: string
  month: string
  day: string
  onChange: (y: string, m: string, d: string) => void
}) {
  const { t } = useLanguage()
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder={t('studentForm.yearPlaceholder')}
          maxLength={4}
          value={year}
          onChange={e => onChange(e.target.value, month, day)}
          className="w-20 px-3 py-2 border border-border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm text-center bg-card"
        />
        <span className="self-center text-muted-foreground font-medium">/</span>
        <input
          type="text"
          placeholder={t('studentForm.monthPlaceholder')}
          maxLength={2}
          value={month}
          onChange={e => onChange(year, e.target.value, day)}
          className="w-14 px-3 py-2 border border-border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm text-center bg-card"
        />
        <span className="self-center text-muted-foreground font-medium">/</span>
        <input
          type="text"
          placeholder={t('studentForm.dayPlaceholder')}
          maxLength={2}
          value={day}
          onChange={e => onChange(year, month, e.target.value)}
          className="w-14 px-3 py-2 border border-border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm text-center bg-card"
        />
      </div>
    </div>
  )
}

function buildDate(year: string, month: string, day: string) {
  if (!year && !month && !day) return ''
  return `${year}/${month.padStart(2, '0')}/${day.padStart(2, '0')}`
}

export default function StudentApplicationForm({ mode, endpoints, initialDocCategories, initialFieldRequirements, onSuccess }: StudentApplicationFormProps) {
  const { data: session } = useSession()
  const canAssign = mode === 'staff' && (session?.user?.role === 'ADMIN' || session?.user?.role === 'OWNER')
  const { agents, failed: agentsFailed } = useAssignableAgents(canAssign, session?.user?.organizationId)
  const [agentId, setAgentId] = useState('')
  useEffect(() => { setAgentId('') }, [session?.user?.organizationId])
  const router = useRouter()
  const { t } = useLanguage()
  const { has: hasFeature } = useFeatures()
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([])
  const [docCategories, setDocCategories] = useState<DocCategory[]>(initialDocCategories || [])
  const [fieldRequirements, setFieldRequirements] = useState<FieldReq[]>(initialFieldRequirements || [])

  // Personal Information
  const [passportFamilyName, setPassportFamilyName] = useState('')
  const [givenName, setGivenName] = useState('')
  const [fullName, setFullName] = useState('')
  const [gender, setGender] = useState('')
  const [chineseName, setChineseName] = useState('')
  const [maritalStatus, setMaritalStatus] = useState('')
  const [religion, setReligion] = useState('')
  const [occupation, setOccupation] = useState('')
  const [employerInstitution, setEmployerInstitution] = useState('')
  const [nationality, setNationality] = useState('')
  const [dateOfBirthYMD, setDateOfBirthYMD] = useState({ year: '', month: '', day: '' })
  const [yearsInHomeCountry, setYearsInHomeCountry] = useState('')
  const [countryOfBirth, setCountryOfBirth] = useState('')
  const [wechat, setWechat] = useState('')
  const [placeOfBirth, setPlaceOfBirth] = useState('')
  const [chineseDescent, setChineseDescent] = useState('No')
  const [currentlyInChina, setCurrentlyInChina] = useState('No')

  // Address
  const [homeAddress, setHomeAddress] = useState('')
  const [detailedAddress, setDetailedAddress] = useState('')
  const [cityProvince, setCityProvince] = useState('')
  const [country, setCountry] = useState('')
  const [zipcode, setZipcode] = useState('')
  const [phoneMobile, setPhoneMobile] = useState('')
  const [mainEmail, setMainEmail] = useState('')

  // Passport
  const [passportNo, setPassportNo] = useState('')
  const [passportExpiryYMD, setPassportExpiryYMD] = useState({ year: '', month: '', day: '' })
  const [oldPassportNo, setOldPassportNo] = useState('')
  const [oldPassportExpiryYMD, setOldPassportExpiryYMD] = useState({ year: '', month: '', day: '' })

  // China Study
  const [studiedInChina, setStudiedInChina] = useState('No')
  const [visaType, setVisaType] = useState('')
  const [chinaInstitution, setChinaInstitution] = useState('')
  const [visaExpiryYMD, setVisaExpiryYMD] = useState({ year: '', month: '', day: '' })
  const [studyInChinaFromYMD, setStudyInChinaFromYMD] = useState({ year: '', month: '', day: '' })
  const [studyInChinaToYMD, setStudyInChinaToYMD] = useState({ year: '', month: '', day: '' })

  // Program
  const [programApplied, setProgramApplied] = useState('')
  const [notes, setNotes] = useState('')

  // Arrays
  const [educationHistory, setEducationHistory] = useState<EducationItem[]>([
    { degree: '', schoolName: '', yearFrom: '', yearTo: '', contactPerson: '' }
  ])
  const [workExperience, setWorkExperience] = useState<WorkItem[]>([
    { yearFrom: '', yearTo: '', company: '', occupation: '', reference: '', phone: '', email: '' }
  ])
  const [familyMembers, setFamilyMembers] = useState<FamilyItem[]>([
    { name: '', relationship: '', nationality: '', employer: '', occupation: '', phone: '', email: '' }
  ])
  const [financialSponsors, setFinancialSponsors] = useState<SponsorItem[]>([
    { name: '', relationship: '', nationality: '', employer: '', occupation: '', phone: '', email: '' }
  ])

  // Photo
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')

  useEffect(() => {
    if (mode !== 'staff') return

    fetch(endpoints.documentRequirements!, { credentials: 'include' })
      .then(r => r.json())
      .then(data => setDocCategories(data))
      .catch(() => toast.error(t('studentForm.failedLoadDocCategories')))

    fetch(endpoints.fieldRequirements!, { credentials: 'include' })
      .then(r => r.json())
      .then(data => setFieldRequirements(data))
      .catch(() => toast.error(t('studentForm.failedLoadFieldRequirements')))
  }, [mode])

  function isRequired(key: string) {
    const req = fieldRequirements.find(f => f.key === key)
    return req ? req.isRequired : false
  }

  function reqLabel(label: string, key: string) {
    return isRequired(key) ? `${label} *` : label
  }

  function handleFileSelectForCategory(e: React.ChangeEvent<HTMLInputElement>, category: DocCategory) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingDocs(prev => [...prev, { file, category }])
    e.target.value = ''
  }

  function removePendingDoc(index: number) {
    setPendingDocs(prev => prev.filter((_, i) => i !== index))
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function handleImportExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (canAssign && agentId) fd.append('agentId', agentId)
      const res = await fetch('/api/students/import', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })
      const data = await res.json()
      if (res.ok) {
        const created = data.created || []
        const failed = data.failed || []
        if (created.length === 1 && failed.length === 0) {
          toast.success(t('studentForm.importSuccess'))
          router.push(`/dashboard/students/${created[0].id}`)
          return
        }
        if (created.length > 0) {
          toast.success(t('studentForm.importBulkSuccess').replace('{count}', String(created.length)))
        }
        if (failed.length > 0) {
          const detail = failed.map((f: any) => `${t('studentForm.importRowLabel').replace('{row}', String(f.row))} (${f.name}): ${f.error}`).join('\n')
          toast.error(`${t('studentForm.importPartialFailed').replace('{count}', String(failed.length))}\n${detail}`, { duration: 10000 })
        }
        if (created.length > 0) router.push('/dashboard/students')
      } else if (Array.isArray(data.failed) && data.failed.length > 0) {
        const detail = data.failed.map((f: any) => `${t('studentForm.importRowLabel').replace('{row}', String(f.row))} (${f.name}): ${f.error}`).join('\n')
        toast.error(`${t('studentForm.importFailed')}\n${detail}`, { duration: 10000 })
      } else {
        toast.error(data.error || t('studentForm.importFailed'))
      }
    } catch {
      toast.error(t('studentForm.importFailed'))
    } finally {
      setImporting(false)
    }
  }

  // Array helpers
  function addEducation() {
    setEducationHistory(prev => [...prev, { degree: '', schoolName: '', yearFrom: '', yearTo: '', contactPerson: '' }])
  }
  function updateEducation(index: number, field: keyof EducationItem, value: string) {
    setEducationHistory(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }
  function removeEducation(index: number) {
    setEducationHistory(prev => prev.filter((_, i) => i !== index))
  }

  function addWork() {
    setWorkExperience(prev => [...prev, { yearFrom: '', yearTo: '', company: '', occupation: '', reference: '', phone: '', email: '' }])
  }
  function updateWork(index: number, field: keyof WorkItem, value: string) {
    setWorkExperience(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }
  function removeWork(index: number) {
    setWorkExperience(prev => prev.filter((_, i) => i !== index))
  }

  function addFamily() {
    setFamilyMembers(prev => [...prev, { name: '', relationship: '', nationality: '', employer: '', occupation: '', phone: '', email: '' }])
  }
  function updateFamily(index: number, field: keyof FamilyItem, value: string) {
    setFamilyMembers(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }
  function removeFamily(index: number) {
    setFamilyMembers(prev => prev.filter((_, i) => i !== index))
  }

  function addSponsor() {
    setFinancialSponsors(prev => [...prev, { name: '', relationship: '', nationality: '', employer: '', occupation: '', phone: '', email: '' }])
  }
  function updateSponsor(index: number, field: keyof SponsorItem, value: string) {
    setFinancialSponsors(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }
  function removeSponsor(index: number) {
    setFinancialSponsors(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const studentData = {
        passportFamilyName,
        givenName,
        fullName,
        gender,
        chineseName,
        maritalStatus,
        religion,
        occupation,
        employerInstitution,
        nationality,
        dateOfBirth: buildDate(dateOfBirthYMD.year, dateOfBirthYMD.month, dateOfBirthYMD.day),
        yearsInHomeCountry,
        countryOfBirth,
        wechat,
        placeOfBirth,
        chineseDescent,
        currentlyInChina,
        homeAddress,
        detailedAddress,
        cityProvince,
        country,
        zipcode,
        phoneMobile,
        mainEmail,
        passportNo,
        passportExpiryDate: buildDate(passportExpiryYMD.year, passportExpiryYMD.month, passportExpiryYMD.day),
        oldPassportNo,
        oldPassportExpiry: buildDate(oldPassportExpiryYMD.year, oldPassportExpiryYMD.month, oldPassportExpiryYMD.day),
        studiedInChina,
        visaType,
        chinaInstitution,
        visaExpiryDate: buildDate(visaExpiryYMD.year, visaExpiryYMD.month, visaExpiryYMD.day),
        studyInChinaFrom: buildDate(studyInChinaFromYMD.year, studyInChinaFromYMD.month, studyInChinaFromYMD.day),
        studyInChinaTo: buildDate(studyInChinaToYMD.year, studyInChinaToYMD.month, studyInChinaToYMD.day),
        programApplied,
        notes,
        educationHistory: educationHistory.filter(e => e.degree || e.schoolName),
        workExperience: workExperience.filter(w => w.company || w.occupation),
        familyMembers: familyMembers.filter(f => f.name || f.relationship),
        financialSponsors: financialSponsors.filter(s => s.name || s.relationship),
      }

      const studentRes = await fetch(endpoints.createStudent, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(mode === 'staff' ? { credentials: 'include' as RequestCredentials } : {}),
        body: JSON.stringify(canAssign ? { ...studentData, agentId: agentId || null } : studentData)
      })

      if (!studentRes.ok) {
        const errData = await studentRes.json().catch(() => ({}))
        toast.error(errData.error || t('studentForm.failedCreateStudent'))
        setLoading(false)
        return
      }

      const student = await studentRes.json()

      if (photoFile) {
        const photoForm = new FormData()
        photoForm.append('file', photoFile)
        photoForm.append('studentId', student.id)
        if (mode === 'public') photoForm.append('uploadToken', student.uploadToken)
        photoForm.append('type', 'IMAGE')
        photoForm.append('category', 'PHOTO')
        await fetch(endpoints.uploadDocument, { method: 'POST', ...(mode === 'staff' ? { credentials: 'include' as RequestCredentials } : {}), body: photoForm })
      }

      let uploadedCount = 0
      for (const { file, category } of pendingDocs) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('studentId', student.id)
        if (mode === 'public') formData.append('uploadToken', student.uploadToken)
        formData.append('type', category.type)
        formData.append('category', category.key)
        const res = await fetch(endpoints.uploadDocument, { method: 'POST', ...(mode === 'staff' ? { credentials: 'include' as RequestCredentials } : {}), body: formData })
        if (res.ok) uploadedCount++
      }

      onSuccess({ id: student.id, serialNumber: student.serialNumber, uploadedCount })
    } catch {
      toast.error(t('studentForm.somethingWentWrong'))
    } finally {
      setLoading(false)
    }
  }

  function getDocIcon(type: string) {
    if (type === 'IMAGE') return <FileImage className="w-5 h-5 text-emerald-500" />
    if (type === 'VIDEO') return <Video className="w-5 h-5 text-rose-500" />
    return <FileText className="w-5 h-5 text-indigo-500" />
  }

  const inputClass = "w-full px-3.5 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm bg-card transition-all"
  const labelClass = "block text-sm font-medium text-foreground mb-1.5"
  const sectionClass = "bg-card rounded-2xl shadow-sm border border-border/60 p-6 backdrop-blur-sm"
  const sectionTitle = "text-lg font-bold text-foreground mb-5 pb-3 border-b border-border flex items-center gap-2"

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {canAssign && (
        <div className="max-w-sm">
          <StudentAgentSelect value={agentId} onChange={setAgentId} agents={agents} />
          {agentsFailed && <p className="mt-2 text-sm text-rose-600" role="alert">{t('students.assignmentAgentsFailed')}</p>}
        </div>
      )}
      {mode === 'staff' && (hasFeature('student_template') || hasFeature('student_import')) && (
        <div className="flex items-center justify-end gap-2 flex-wrap">
          {hasFeature('student_template') && (
            <a
              href="/api/students/template"
              className="px-3.5 py-2 border border-border rounded-xl text-foreground hover:bg-muted transition flex items-center gap-2 text-sm font-medium"
            >
              <FileText className="w-4 h-4" /> {t('studentForm.downloadTemplate')}
            </a>
          )}
          {hasFeature('student_import') && (
            <label className="px-3.5 py-2 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 rounded-xl hover:bg-indigo-100 transition flex items-center gap-2 text-sm font-medium cursor-pointer">
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {t('studentForm.importFromExcel')}
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} disabled={importing} />
            </label>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">

          {/* 1. Personal Information */}
          <div className={sectionClass}>
            <h3 className={sectionTitle}><span className="text-indigo-600 font-bold">1.</span> {t('studentFields.personalInformation')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{reqLabel(t('studentFields.passportFamilyName'), 'passportFamilyName')}</label>
                <input required={isRequired('passportFamilyName')} value={passportFamilyName} onChange={e => setPassportFamilyName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{reqLabel(t('studentFields.givenName'), 'givenName')}</label>
                <input required={isRequired('givenName')} value={givenName} onChange={e => setGivenName(e.target.value)} className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>{reqLabel(t('studentFields.fullName'), 'fullName')}</label>
                <input required={isRequired('fullName')} value={fullName} onChange={e => setFullName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{reqLabel(t('studentFields.gender'), 'gender')}</label>
                <select required={isRequired('gender')} value={gender} onChange={e => setGender(e.target.value)} className={inputClass}>
                  <option value="">{t('studentForm.selectPlaceholder')}</option>
                  <option value="Male">{t('studentForm.genderMale')}</option>
                  <option value="Female">{t('studentForm.genderFemale')}</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>{reqLabel(t('studentFields.maritalStatus'), 'maritalStatus')}</label>
                <select required={isRequired('maritalStatus')} value={maritalStatus} onChange={e => setMaritalStatus(e.target.value)} className={inputClass}>
                  <option value="">{t('studentForm.selectPlaceholder')}</option>
                  <option value="Single">{t('studentForm.maritalSingle')}</option>
                  <option value="Married">{t('studentForm.maritalMarried')}</option>
                  <option value="Divorced">{t('studentForm.maritalDivorced')}</option>
                  <option value="Widowed">{t('studentForm.maritalWidowed')}</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>{t('studentFields.chineseName')}</label>
                <input value={chineseName} onChange={e => setChineseName(e.target.value)} className={inputClass} placeholder={t('studentForm.ifAny')} />
              </div>
              <div>
                <label className={labelClass}>{reqLabel(t('studentFields.religion'), 'religion')}</label>
                <input required={isRequired('religion')} value={religion} onChange={e => setReligion(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{reqLabel(t('studentFields.occupation'), 'occupation')}</label>
                <input required={isRequired('occupation')} value={occupation} onChange={e => setOccupation(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{t('studentFields.employerInstitution')}</label>
                <input value={employerInstitution} onChange={e => setEmployerInstitution(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{reqLabel(t('studentFields.nationality'), 'nationality')}</label>
                <input required={isRequired('nationality')} value={nationality} onChange={e => setNationality(e.target.value)} className={inputClass} />
              </div>
              <YearMonthDayInput
                label={reqLabel(t('studentFields.dateOfBirth'), 'dateOfBirth')}
                required={isRequired('dateOfBirth')}
                year={dateOfBirthYMD.year}
                month={dateOfBirthYMD.month}
                day={dateOfBirthYMD.day}
                onChange={(y, m, d) => setDateOfBirthYMD({ year: y, month: m, day: d })}
              />
              <div>
                <label className={labelClass}>{reqLabel(t('studentFields.countryOfBirth'), 'countryOfBirth')}</label>
                <input required={isRequired('countryOfBirth')} value={countryOfBirth} onChange={e => setCountryOfBirth(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{reqLabel(t('studentFields.placeOfBirth'), 'placeOfBirth')}</label>
                <input required={isRequired('placeOfBirth')} value={placeOfBirth} onChange={e => setPlaceOfBirth(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{t('studentFields.yearsInHomeCountry')}</label>
                <input value={yearsInHomeCountry} onChange={e => setYearsInHomeCountry(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{t('studentFields.wechat')}</label>
                <input value={wechat} onChange={e => setWechat(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{reqLabel(t('studentFields.chineseDescent'), 'chineseDescent')}</label>
                <select required={isRequired('chineseDescent')} value={chineseDescent} onChange={e => setChineseDescent(e.target.value)} className={inputClass}>
                  <option value="No">{t('common.no')}</option>
                  <option value="Yes">{t('common.yes')}</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>{reqLabel(t('studentFields.currentlyInChina'), 'currentlyInChina')}</label>
                <select required={isRequired('currentlyInChina')} value={currentlyInChina} onChange={e => setCurrentlyInChina(e.target.value)} className={inputClass}>
                  <option value="No">{t('common.no')}</option>
                  <option value="Yes">{t('common.yes')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* 2. Correspondence Address */}
          <div className={sectionClass}>
            <h3 className={sectionTitle}><span className="text-indigo-600 font-bold">2.</span> {t('studentFields.correspondenceAddress')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={labelClass}>{t('studentFields.homeAddress')}</label>
                <input value={homeAddress} onChange={e => setHomeAddress(e.target.value)} className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>{reqLabel(t('studentFields.detailedAddress'), 'detailedAddress')}</label>
                <input required={isRequired('detailedAddress')} value={detailedAddress} onChange={e => setDetailedAddress(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{reqLabel(t('studentFields.cityProvince'), 'cityProvince')}</label>
                <input required={isRequired('cityProvince')} value={cityProvince} onChange={e => setCityProvince(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{reqLabel(t('studentFields.country'), 'country')}</label>
                <input required={isRequired('country')} value={country} onChange={e => setCountry(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{reqLabel(t('studentFields.zipcode'), 'zipcode')}</label>
                <input required={isRequired('zipcode')} value={zipcode} onChange={e => setZipcode(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{reqLabel(t('studentFields.phoneMobile'), 'phoneMobile')}</label>
                <input required={isRequired('phoneMobile')} value={phoneMobile} onChange={e => setPhoneMobile(e.target.value)} className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>{reqLabel(t('studentFields.mainEmail'), 'mainEmail')}</label>
                <input type="email" required={isRequired('mainEmail')} value={mainEmail} onChange={e => setMainEmail(e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>

          {/* 3. Passport & Visa */}
          <div className={sectionClass}>
            <h3 className={sectionTitle}><span className="text-indigo-600 font-bold">3.</span> {t('studentFields.passportVisaSection')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{reqLabel(t('studentFields.passportNo'), 'passportNo')}</label>
                <input required={isRequired('passportNo')} value={passportNo} onChange={e => setPassportNo(e.target.value)} className={inputClass} />
              </div>
              <YearMonthDayInput
                label={reqLabel(t('studentFields.passportExpiryDate'), 'passportExpiryDate')}
                required={isRequired('passportExpiryDate')}
                year={passportExpiryYMD.year}
                month={passportExpiryYMD.month}
                day={passportExpiryYMD.day}
                onChange={(y, m, d) => setPassportExpiryYMD({ year: y, month: m, day: d })}
              />
              <div>
                <label className={labelClass}>{t('studentFields.oldPassportNo')}</label>
                <input value={oldPassportNo} onChange={e => setOldPassportNo(e.target.value)} className={inputClass} />
              </div>
              <YearMonthDayInput
                label={t('studentFields.oldPassportExpiry')}
                year={oldPassportExpiryYMD.year}
                month={oldPassportExpiryYMD.month}
                day={oldPassportExpiryYMD.day}
                onChange={(y, m, d) => setOldPassportExpiryYMD({ year: y, month: m, day: d })}
              />
            </div>
          </div>

          {/* 4. Learning Experience in China */}
          <div className={sectionClass}>
            <h3 className={sectionTitle}><span className="text-indigo-600 font-bold">4.</span> {t('studentFields.learningExperienceChina')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{reqLabel(t('studentFields.studiedInChina'), 'studiedInChina')}</label>
                <select required={isRequired('studiedInChina')} value={studiedInChina} onChange={e => setStudiedInChina(e.target.value)} className={inputClass}>
                  <option value="No">{t('common.no')}</option>
                  <option value="Yes">{t('common.yes')}</option>
                </select>
              </div>
              {studiedInChina === 'Yes' && (
                <>
                  <div>
                    <label className={labelClass}>{t('studentFields.visaType')}</label>
                    <input value={visaType} onChange={e => setVisaType(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>{t('studentFields.chinaInstitution')}</label>
                    <input value={chinaInstitution} onChange={e => setChinaInstitution(e.target.value)} className={inputClass} />
                  </div>
                  <YearMonthDayInput
                    label={t('studentFields.visaExpiryDate')}
                    year={visaExpiryYMD.year}
                    month={visaExpiryYMD.month}
                    day={visaExpiryYMD.day}
                    onChange={(y, m, d) => setVisaExpiryYMD({ year: y, month: m, day: d })}
                  />
                  <YearMonthDayInput
                    label={t('studentFields.studyInChinaFrom')}
                    year={studyInChinaFromYMD.year}
                    month={studyInChinaFromYMD.month}
                    day={studyInChinaFromYMD.day}
                    onChange={(y, m, d) => setStudyInChinaFromYMD({ year: y, month: m, day: d })}
                  />
                  <YearMonthDayInput
                    label={t('studentFields.studyInChinaTo')}
                    year={studyInChinaToYMD.year}
                    month={studyInChinaToYMD.month}
                    day={studyInChinaToYMD.day}
                    onChange={(y, m, d) => setStudyInChinaToYMD({ year: y, month: m, day: d })}
                  />
                </>
              )}
            </div>
          </div>

          {/* 5. Program Applied */}
          <div className={sectionClass}>
            <h3 className={sectionTitle}><span className="text-indigo-600 font-bold">5.</span> {t('studentFields.programAppliedSection')}</h3>
            <div>
              <label className={labelClass}>{reqLabel(t('studentFields.programApplied'), 'programApplied')}</label>
              <input value={programApplied} onChange={e => setProgramApplied(e.target.value)} className={inputClass} required={isRequired('programApplied')} />
            </div>
          </div>

          {/* 6. Financial Sponsors */}
          <div className={sectionClass}>
            <h3 className={sectionTitle}><span className="text-indigo-600 font-bold">6.</span> {t('studentFields.financialSponsors')}</h3>
            {financialSponsors.map((s, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 p-3 bg-muted/70 rounded-xl border border-border">
                <input placeholder={`${t('studentFields.name')} *`} required value={s.name} onChange={e => updateSponsor(i, 'name', e.target.value)} className={inputClass} />
                <input placeholder={`${t('studentFields.relationship')} *`} required value={s.relationship} onChange={e => updateSponsor(i, 'relationship', e.target.value)} className={inputClass} />
                <input placeholder={`${t('studentFields.nationality')} *`} required value={s.nationality} onChange={e => updateSponsor(i, 'nationality', e.target.value)} className={inputClass} />
                <input placeholder={t('studentFields.employer')} value={s.employer} onChange={e => updateSponsor(i, 'employer', e.target.value)} className={inputClass} />
                <input placeholder={t('studentFields.occupation')} value={s.occupation} onChange={e => updateSponsor(i, 'occupation', e.target.value)} className={inputClass} />
                <input placeholder={t('studentFields.phone')} value={s.phone} onChange={e => updateSponsor(i, 'phone', e.target.value)} className={inputClass} />
                <input placeholder={t('studentFields.email')} value={s.email} onChange={e => updateSponsor(i, 'email', e.target.value)} className={inputClass} />
                <div className="md:col-span-2 flex justify-end">
                  {financialSponsors.length > 1 && (
                    <button type="button" onClick={() => removeSponsor(i)} className="text-red-500 text-sm flex items-center gap-1 hover:text-red-700 transition">
                      <Trash2 className="w-4 h-4" /> {t('studentForm.remove')}
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button type="button" onClick={addSponsor} className="text-indigo-600 text-sm flex items-center gap-1.5 mt-2 font-medium hover:text-indigo-800 transition">
              <Plus className="w-4 h-4" /> {t('studentForm.addSponsor')}
            </button>
          </div>

          {/* 7. Education Background */}
          <div className={sectionClass}>
            <h3 className={sectionTitle}><span className="text-indigo-600 font-bold">7.</span> {t('studentFields.educationHistory')}</h3>
            {educationHistory.map((edu, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 p-3 bg-muted/70 rounded-xl border border-border">
                <input placeholder={`${t('studentFields.degree')} *`} required value={edu.degree} onChange={e => updateEducation(i, 'degree', e.target.value)} className={inputClass} />
                <input placeholder={`${t('studentFields.schoolName')} *`} required value={edu.schoolName} onChange={e => updateEducation(i, 'schoolName', e.target.value)} className={inputClass} />
                <input placeholder={t('studentFields.yearFrom')} value={edu.yearFrom} onChange={e => updateEducation(i, 'yearFrom', e.target.value)} className={inputClass} />
                <input placeholder={t('studentFields.yearTo')} value={edu.yearTo} onChange={e => updateEducation(i, 'yearTo', e.target.value)} className={inputClass} />
                <input placeholder={t('studentFields.contactPerson')} value={edu.contactPerson} onChange={e => updateEducation(i, 'contactPerson', e.target.value)} className={inputClass} />
                <div className="flex justify-end items-center">
                  {educationHistory.length > 1 && (
                    <button type="button" onClick={() => removeEducation(i)} className="text-red-500 text-sm flex items-center gap-1 hover:text-red-700 transition">
                      <Trash2 className="w-4 h-4" /> {t('studentForm.remove')}
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button type="button" onClick={addEducation} className="text-indigo-600 text-sm flex items-center gap-1.5 mt-2 font-medium hover:text-indigo-800 transition">
              <Plus className="w-4 h-4" /> {t('studentForm.addEducation')}
            </button>
          </div>

          {/* 8. Work Experience */}
          <div className={sectionClass}>
            <h3 className={sectionTitle}><span className="text-indigo-600 font-bold">8.</span> {t('studentFields.workExperience')}</h3>
            {workExperience.map((w, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 p-3 bg-muted/70 rounded-xl border border-border">
                <input placeholder={t('studentFields.yearFrom')} value={w.yearFrom} onChange={e => updateWork(i, 'yearFrom', e.target.value)} className={inputClass} />
                <input placeholder={t('studentFields.yearTo')} value={w.yearTo} onChange={e => updateWork(i, 'yearTo', e.target.value)} className={inputClass} />
                <input placeholder={t('studentFields.company')} value={w.company} onChange={e => updateWork(i, 'company', e.target.value)} className={inputClass} />
                <input placeholder={t('studentFields.occupation')} value={w.occupation} onChange={e => updateWork(i, 'occupation', e.target.value)} className={inputClass} />
                <input placeholder={t('studentFields.reference')} value={w.reference} onChange={e => updateWork(i, 'reference', e.target.value)} className={inputClass} />
                <input placeholder={t('studentFields.phone')} value={w.phone} onChange={e => updateWork(i, 'phone', e.target.value)} className={inputClass} />
                <input placeholder={t('studentFields.email')} value={w.email} onChange={e => updateWork(i, 'email', e.target.value)} className={inputClass} />
                <div className="md:col-span-2 flex justify-end">
                  {workExperience.length > 1 && (
                    <button type="button" onClick={() => removeWork(i)} className="text-red-500 text-sm flex items-center gap-1 hover:text-red-700 transition">
                      <Trash2 className="w-4 h-4" /> {t('studentForm.remove')}
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button type="button" onClick={addWork} className="text-indigo-600 text-sm flex items-center gap-1.5 mt-2 font-medium hover:text-indigo-800 transition">
              <Plus className="w-4 h-4" /> {t('studentForm.addWorkExperience')}
            </button>
          </div>

          {/* 9. Family Members */}
          <div className={sectionClass}>
            <h3 className={sectionTitle}><span className="text-indigo-600 font-bold">9.</span> {t('studentFields.familyMembers')} {t('studentForm.atLeastTwo')}</h3>
            <p className="text-xs text-muted-foreground mb-3">{t('studentForm.parentsInfoRequired')}</p>
            {familyMembers.map((f, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 p-3 bg-muted/70 rounded-xl border border-border">
                <input placeholder={`${t('studentFields.name')} *`} required value={f.name} onChange={e => updateFamily(i, 'name', e.target.value)} className={inputClass} />
                <input placeholder={`${t('studentFields.relationship')} *`} required value={f.relationship} onChange={e => updateFamily(i, 'relationship', e.target.value)} className={inputClass} />
                <input placeholder={`${t('studentFields.nationality')} *`} required value={f.nationality} onChange={e => updateFamily(i, 'nationality', e.target.value)} className={inputClass} />
                <input placeholder={t('studentFields.employer')} value={f.employer} onChange={e => updateFamily(i, 'employer', e.target.value)} className={inputClass} />
                <input placeholder={t('studentFields.occupation')} value={f.occupation} onChange={e => updateFamily(i, 'occupation', e.target.value)} className={inputClass} />
                <input placeholder={t('studentFields.phone')} value={f.phone} onChange={e => updateFamily(i, 'phone', e.target.value)} className={inputClass} />
                <input placeholder={t('studentFields.email')} value={f.email} onChange={e => updateFamily(i, 'email', e.target.value)} className={inputClass} />
                <div className="md:col-span-2 flex justify-end">
                  {familyMembers.length > 1 && (
                    <button type="button" onClick={() => removeFamily(i)} className="text-red-500 text-sm flex items-center gap-1 hover:text-red-700 transition">
                      <Trash2 className="w-4 h-4" /> {t('studentForm.remove')}
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button type="button" onClick={addFamily} className="text-indigo-600 text-sm flex items-center gap-1.5 mt-2 font-medium hover:text-indigo-800 transition">
              <Plus className="w-4 h-4" /> {t('studentForm.addFamilyMember')}
            </button>
          </div>

          {/* Notes */}
          <div className={sectionClass}>
            <h3 className={sectionTitle}><span className="text-indigo-600 font-bold">10.</span> {t('studentFields.additionalNotes')}</h3>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={inputClass} />
          </div>
        </div>

        {/* Right Sidebar: Photo + Documents */}
        <div className="space-y-6">
          {/* Photo Upload */}
          <div className={sectionClass}>
            <h3 className="text-lg font-bold text-foreground mb-4">{t('studentForm.passportPhotoTitle')}</h3>
            <div className="flex flex-col items-center">
              {photoPreview ? (
                <div className="relative">
                  <img src={photoPreview} alt={t('studentForm.photoPreviewAlt')} className="w-32 h-40 object-cover rounded-xl border-2 border-indigo-100 shadow-sm" />
                  <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview('') }} className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 shadow-md hover:bg-rose-600 transition">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="w-32 h-40 border-2 border-dashed border-border rounded-xl flex items-center justify-center bg-muted/50">
                  <Image className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
              <label className="mt-4 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm cursor-pointer hover:bg-indigo-700 transition shadow-sm font-medium">
                <Upload className="w-4 h-4 inline mr-1.5" />
                {t('studentForm.uploadPhotoButton')}
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
              </label>
              <p className="text-xs text-muted-foreground mt-2 text-center">{t('studentForm.photoRequirements')}</p>
            </div>
          </div>

          {/* Dynamic Document Categories */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-foreground">{t('studentForm.requiredDocumentsTitle')}</h3>
            {docCategories.map((cat) => {
              const catDocs = pendingDocs.map((d, idx) => ({ ...d, originalIndex: idx })).filter(d => d.category.key === cat.key)
              return (
                <div key={cat.key} className="bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden">
                  <div className="bg-muted/80 px-4 py-2.5 border-b border-border">
                    <h4 className="font-medium text-sm text-foreground">
                      {cat.label}
                      {cat.isRequired && <span className="text-rose-500 ml-1">*</span>}
                    </h4>
                    {cat.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>
                    )}
                  </div>
                  <div className="p-3">
                    {catDocs.length > 0 ? (
                      <div className="space-y-2 mb-2">
                        {catDocs.map((doc) => (
                          <div key={doc.originalIndex} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                            {getDocIcon(doc.category.type)}
                            <span className="flex-1 text-xs text-foreground truncate">{doc.file.name}</span>
                            <button type="button" onClick={() => removePendingDoc(doc.originalIndex)} className="text-rose-500 hover:text-rose-700 transition">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <label className="flex items-center justify-center gap-2 w-full py-2.5 border border-dashed border-border rounded-xl cursor-pointer hover:bg-muted transition">
                      <Upload className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{t('common.add')} {cat.label}</span>
                      <input type="file" accept={cat.accept} className="hidden" onChange={(e) => handleFileSelectForCategory(e, cat)} />
                    </label>
                    {cat.maxSize && <p className="text-xs text-muted-foreground text-center mt-1">{t('studentForm.maxSizeLabel')} {cat.maxSize}</p>}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="bg-indigo-50/70 rounded-2xl border border-indigo-100 p-5">
            <h4 className="text-sm font-bold text-indigo-900 mb-1">{t('studentForm.tip')}</h4>
            <p className="text-xs text-indigo-700 leading-relaxed">{t('studentForm.tipSaveApplication')}</p>
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3 pt-5 border-t bg-card rounded-2xl shadow-sm border border-border/60 p-5 sticky bottom-4 backdrop-blur-sm">
        {mode === 'staff' && (
          <Link href="/dashboard/students" className="px-6 py-2.5 border border-border rounded-xl text-foreground hover:bg-muted transition font-medium">
            {t('common.cancel')}
          </Link>
        )}
        <button type="submit" disabled={loading} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-2 font-medium shadow-sm">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          <Save className="w-4 h-4" />
          {t('studentForm.saveApplication')}
        </button>
      </div>
    </form>
  )
}
