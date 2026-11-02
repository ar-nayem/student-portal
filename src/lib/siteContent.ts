export const SITE_CONTENT_TYPES = ['OFFER', 'UNIVERSITY', 'SCHOLARSHIP', 'ARTICLE', 'SERVICE', 'FAQ', 'PAGE'] as const
export type SiteContentType = typeof SITE_CONTENT_TYPES[number]

export function validateSiteContent(input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('Invalid content')
  const data = input as Record<string, unknown>
  const read = (key: string, max: number) => {
    const value = data[key]
    if (value == null) return ''
    if (typeof value !== 'string' || value.length > max) throw new Error(`Invalid ${key}`)
    return value.trim()
  }
  const type = read('type', 32)
  const title = read('title', 180)
  const slug = read('slug', 100).toLowerCase()
  if (!SITE_CONTENT_TYPES.includes(type as SiteContentType)) throw new Error('Invalid content type')
  if (!title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Title and URL slug are required')
  const url = (key: string) => {
    const value = read(key, 1000)
    if (!value) return null
    try { const parsed = new URL(value); if (parsed.protocol !== 'https:') throw new Error() }
    catch { throw new Error(`${key} must be an HTTPS URL`) }
    return value
  }
  const sortOrder = Number(data.sortOrder ?? 0)
  if (!Number.isInteger(sortOrder) || sortOrder < -10000 || sortOrder > 10000) throw new Error('Invalid sort order')
  if (typeof data.published !== 'boolean') throw new Error('Invalid publish status')
  return {
    type, title, slug,
    summary: read('summary', 600), body: read('body', 10000),
    imageUrl: url('imageUrl'), linkUrl: url('linkUrl'),
    province: read('province', 100) || null, city: read('city', 100) || null,
    subject: read('subject', 100) || null, level: read('level', 100) || null,
    published: data.published, sortOrder,
  }
}
