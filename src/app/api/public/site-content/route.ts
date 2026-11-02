export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'

export async function GET() {
  const items = await prisma.siteContent.findMany({
    where: { published: true },
    orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
    select: { id: true, type: true, slug: true, title: true, summary: true, body: true,
      imageUrl: true, linkUrl: true, province: true, city: true, subject: true, level: true, updatedAt: true },
  })
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'public, max-age=30, must-revalidate' } })
}
