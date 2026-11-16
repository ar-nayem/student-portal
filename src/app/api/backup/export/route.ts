export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser, orgHasFeature } from '@/src/lib/session'
import { requireOrgId } from '@/src/lib/orgScope'
import { FLAT_FIELDS, NESTED_SECTIONS } from '@/src/lib/studentExcel'
import { logActivity } from '@/src/lib/activity'
import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { createReadStream } from 'fs'
import { findStudentDocumentPath } from '@/src/lib/studentDocumentStorage'
import { Readable } from 'stream'

// One-click "take everything with me" export for an org's OWNER (always) or
// an ADMIN the owner has explicitly granted canExportBackup — a full local
// copy of every student record, nested history, transaction, and uploaded
// document for their own organization, zipped for download to their own
// machine. Complements server-side automated backups rather than replacing
// them: this is a manual, on-demand pull, not a schedule.
export async function GET(req: NextRequest) {
  try {
    const user = await getEffectiveUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await orgHasFeature(user.organizationId, 'backup_export'))) {
      return NextResponse.json({ error: 'Full Backup is not included in your plan' }, { status: 403 })
    }

    if (user.role !== 'OWNER') {
      if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { canExportBackup: true } })
      if (!dbUser?.canExportBackup) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const orgId = requireOrgId(user)
    if (!orgId) return NextResponse.json({ error: 'No active organization context' }, { status: 400 })

    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } })

    const students = await prisma.student.findMany({
      where: { organizationId: orgId },
      include: {
        agent: { select: { name: true } },
        documents: true,
        educationHistory: true,
        workExperience: true,
        familyMembers: true,
        financialSponsors: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    const requirements = await prisma.documentRequirement.findMany({ where: { organizationId: orgId } })
    const labelByKey = new Map(requirements.map(r => [r.key, r.label]))
    labelByKey.set('PHOTO', 'Photo')

    const transactions = await prisma.transaction.findMany({
      where: { organizationId: orgId },
      include: {
        student: { select: { fullName: true, serialNumber: true } },
        agent: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { transactionDate: 'desc' },
    })

    // --- students.xlsx: one row per student, plus every nested section across all students ---
    const studentRows = students.map((s) => {
      const row: Record<string, string> = { 'Serial No.': s.serialNumber || '', Status: s.status, Agent: s.agent?.name || '' }
      for (const f of FLAT_FIELDS) row[f.label] = (s as any)[f.key] ?? ''
      return row
    })
    const studentsWb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(studentsWb, XLSX.utils.json_to_sheet(studentRows), 'Students')

    for (const [relKey, section] of Object.entries(NESTED_SECTIONS)) {
      const rows: Record<string, string>[] = []
      for (const s of students) {
        for (const item of (s as any)[relKey] || []) {
          const row: Record<string, string> = { 'Serial No.': s.serialNumber || '', 'Student Name': s.fullName }
          for (const f of section.fields) row[f.label] = item[f.key] ?? ''
          rows.push(row)
        }
      }
      XLSX.utils.book_append_sheet(studentsWb, XLSX.utils.json_to_sheet(rows), section.sheet)
    }
    const studentsBuf = XLSX.write(studentsWb, { type: 'buffer', bookType: 'xlsx' })

    // --- transactions.xlsx ---
    const txRows = transactions.map((tx) => ({
      Date: tx.transactionDate.toISOString().slice(0, 10),
      Type: tx.type,
      Category: tx.category,
      Amount: tx.amount,
      Currency: tx.currency,
      'Payment Method': tx.paymentMethod || '',
      Status: tx.status,
      Student: tx.student.fullName,
      'Serial No.': tx.student.serialNumber || '',
      Agent: tx.agent.name,
      'Logged By': tx.createdBy.name,
      Description: tx.description || '',
    }))
    const txWb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(txWb, XLSX.utils.json_to_sheet(txRows), 'Transactions')
    const txBuf = XLSX.write(txWb, { type: 'buffer', bookType: 'xlsx' })

    // --- zip it all, streaming documents in rather than buffering (same
    // reasoning as batch-download: this VPS has hit its RAM limit before
    // when every file was held in memory before zipping even started) ---
    const zip = new JSZip()
    zip.file('students.xlsx', studentsBuf)
    zip.file('transactions.xlsx', txBuf)

    const sanitize = (name: string) => name.replace(/[\\/:*?"<>|]/g, '-').trim()

    for (const student of students) {
      const folderName = sanitize(`${student.serialNumber || student.id.slice(0, 8)}-${student.fullName}`)
      const folder = zip.folder(`documents/${folderName}`)
      if (!folder) continue

      const usedNames = new Map<string, number>()
      for (const doc of student.documents) {
        const filePath = await findStudentDocumentPath(doc.filename)
        if (!filePath) continue

        const ext = doc.originalName.includes('.') ? doc.originalName.split('.').pop() : ''
        const baseName = sanitize(labelByKey.get(doc.category) || doc.originalName.replace(/\.[^.]+$/, ''))
        const count = usedNames.get(baseName) || 0
        usedNames.set(baseName, count + 1)
        const suffix = count > 0 ? ` (${count + 1})` : ''
        const finalName = ext ? `${baseName}${suffix}.${ext}` : `${baseName}${suffix}`
        folder.file(finalName, createReadStream(filePath))
      }
    }

    await logActivity(user.id, 'FULL_BACKUP_EXPORTED', `${students.length} students, ${transactions.length} transactions`)

    const nodeStream = zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'STORE' })
    const webStream = Readable.toWeb(nodeStream as unknown as Readable) as unknown as ReadableStream

    const orgLabel = sanitize(org?.name || 'organization')
    return new NextResponse(webStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${orgLabel}-backup-${new Date().toISOString().slice(0, 10)}.zip"`,
      },
    })
  } catch (error) {
    console.error('Full backup export error:', error)
    return NextResponse.json({ error: 'Failed to export backup' }, { status: 500 })
  }
}
