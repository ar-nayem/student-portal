export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser, isAdminRole, orgHasFeature } from '@/src/lib/session'
import { parseAdmissionOffer, parseOfferError } from '@/src/lib/admissionOffers'
import { canManageSiteContent } from '@/src/lib/siteContentAccess'

async function managementUser(req: NextRequest) {
  const user = await getEffectiveUser(req)
  if (!user || !isAdminRole(user.role) || !user.organizationId || !canManageSiteContent(user)) return null
  if (!(await orgHasFeature(user.organizationId, 'offers'))) return null
  return user
}

export async function GET(req: NextRequest) {
  const user = await managementUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const offers = await prisma.admissionOffer.findMany({
    where: { organizationId: user.organizationId! },
    orderBy: [{ updatedAt: 'desc' }],
  })
  return NextResponse.json(offers)
}

export async function POST(req: NextRequest) {
  const user = await managementUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let data: ReturnType<typeof parseAdmissionOffer>
  try {
    data = parseAdmissionOffer(await req.json())
  } catch (error) {
    return parseOfferError(error)
  }
  try {
    const offer = await prisma.admissionOffer.create({ data: { ...data, organizationId: user.organizationId!, createdById: user.id } })
    return NextResponse.json(offer, { status: 201 })
  } catch (error) {
    console.error('Admission offer creation failed:', error)
    return NextResponse.json({ error: 'Failed to create offer' }, { status: 500 })
  }
}
