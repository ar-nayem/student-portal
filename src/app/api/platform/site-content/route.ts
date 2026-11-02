export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser } from '@/src/lib/session'
import { SUPER_DEVELOPER } from '@/src/lib/roles'
import { validateSiteContent } from '@/src/lib/siteContent'

export async function GET(req: NextRequest) {
  const user = await getEffectiveUser(req)
  if (user?.actualRole !== SUPER_DEVELOPER) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json(await prisma.siteContent.findMany({ orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { updatedAt: 'desc' }] }))
}
export async function POST(req: NextRequest) {
  const user = await getEffectiveUser(req)
  if (user?.actualRole !== SUPER_DEVELOPER) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const data = validateSiteContent(await req.json())
    return NextResponse.json(await prisma.siteContent.create({ data }), { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid content'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
