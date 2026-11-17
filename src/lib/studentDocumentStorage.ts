import { lstat, unlink } from 'fs/promises'
import { join } from 'path'

export const STUDENT_DOCUMENT_DIR = join(process.cwd(), 'storage', 'student-documents')
const legacyDir = join(process.cwd(), 'public', 'uploads')

export function studentDocumentPath(filename: string) {
  if (!filename || filename === '.' || filename === '..' || /[\/\\\x00]/.test(filename)) {
    throw new Error('Invalid stored student document name')
  }
  return join(STUDENT_DOCUMENT_DIR, filename)
}

async function isFile(path: string) {
  try {
    return (await lstat(path)).isFile()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

// Keep authorized reads working while legacy files are moved at rollout.
export async function findStudentDocumentPath(filename: string) {
  const path = studentDocumentPath(filename)
  if (await isFile(path)) return path
  const legacyPath = join(legacyDir, filename)
  return await isFile(legacyPath) ? legacyPath : null
}

export async function removeStudentDocument(filename: string) {
  const path = studentDocumentPath(filename)
  const legacyPath = join(legacyDir, filename)
  const removed = await Promise.all([path, legacyPath].map(async location => {
    try {
      await unlink(location)
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return false
    }
  }))
  return removed.some(Boolean)
}
