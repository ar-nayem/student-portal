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

export async function PATCH(req: NextRequest, context: { params: { id: string } }) {
  const user = await managementUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let data: ReturnType<typeof parseAdmissionOffer>
  try {
    data = parseAdmissionOffer(await req.json())
  } catch (error) {
    return parseOfferError(error)
  }
  try {
    const result = await prisma.admissionOffer.updateMany({
      where: { id: context.params.id, organizationId: user.organizationId! },
      data,
    })
    if (!result.count) return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    return NextResponse.json(await prisma.admissionOffer.findFirst({ where: { id: context.params.id, organizationId: user.organizationId! } }))
  } catch (error) {
    console.error('Admission offer update failed:', error)
    return NextResponse.json({ error: 'Failed to update offer' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, context: { params: { id: string } }) {
  const user = await managementUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await prisma.admissionOffer.deleteMany({ where: { id: context.params.id, organizationId: user.organizationId! } })
  if (!result.count) return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
