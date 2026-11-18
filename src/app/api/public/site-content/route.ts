export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'
import { publicAdmissionOffer } from '@/src/lib/admissionOffers'

export async function GET() {
  const now = new Date()
  const editorIds = (process.env.EDVUNO_CONTENT_EDITOR_IDS || '').split(',').map(id => id.trim()).filter(Boolean)
  const editorOrganizations = editorIds.length ? await prisma.user.findMany({
    where: { id: { in: editorIds }, isActive: true, role: { in: ['OWNER', 'ADMIN'] }, organizationId: { not: null } },
    select: { organizationId: true },
  }) : []
  const organizationIds = Array.from(new Set(editorOrganizations.map(user => user.organizationId).filter((id): id is string => !!id)))
  const [items, admissionOffers, portalOffers] = await Promise.all([
    prisma.siteContent.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
      select: { id: true, type: true, slug: true, title: true, summary: true, body: true,
        imageUrl: true, linkUrl: true, province: true, city: true, subject: true, level: true, updatedAt: true },
    }),
    organizationIds.length ? prisma.admissionOffer.findMany({
      where: { organizationId: { in: organizationIds }, status: 'PUBLISHED', AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
      orderBy: [{ updatedAt: 'desc' }],
    }) : Promise.resolve([]),
    organizationIds.length ? prisma.offer.findMany({
      where: {
        organizationId: { in: organizationIds },
        publishToWebsite: true,
        isActive: true,
        startDate: { lte: now },
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
      },
      orderBy: [{ updatedAt: 'desc' }],
    }) : Promise.resolve([]),
  ])
  const publishedOffers = [
    ...admissionOffers.map(offer => publicAdmissionOffer(offer)),
    ...portalOffers.map(offer => publicAdmissionOffer({
      ...offer,
      publicTitle: offer.publicTitle || offer.title,
      publicDescription: offer.publicDescription || offer.description,
    })),
  ]
  return NextResponse.json({ items, admissionOffers: publishedOffers }, { headers: { 'Cache-Control': 'public, max-age=30, must-revalidate' } })
}
