export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser } from '@/src/lib/session'
import { canManageSiteContent } from '@/src/lib/siteContentAccess'
import { validateSiteContent } from '@/src/lib/siteContent'

async function allowed(req: NextRequest) { return canManageSiteContent(await getEffectiveUser(req)) }
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await allowed(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const data = validateSiteContent(await req.json())
    return NextResponse.json(await prisma.siteContent.update({ where: { id: params.id }, data }))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid content' }, { status: 400 })
  }
}
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await allowed(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    await prisma.siteContent.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Content not found' }, { status: 404 }) }
}
