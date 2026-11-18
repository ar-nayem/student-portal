export const dynamic = 'force-dynamic'

import { prisma } from '@/src/lib/prisma'
import { getEffectiveUser, isAdminRole, orgHasFeature } from '@/src/lib/session'
import { isSameOrg } from '@/src/lib/orgScope'
import { NextRequest, NextResponse } from 'next/server'
import { parseAdmissionOffer, parseOfferError } from '@/src/lib/admissionOffers'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getEffectiveUser(req)
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await orgHasFeature(user.organizationId, 'offers'))) {
      return NextResponse.json({ error: 'Offers is not included in your plan' }, { status: 403 })
    }

    const { id } = await params
    const existing = await prisma.offer.findUnique({ where: { id } })
    if (!existing || !isSameOrg(user, existing)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = await req.json()
    const data: any = {}
    if (typeof body.title === 'string') data.title = body.title
    if (typeof body.description === 'string') data.description = body.description
    if ('imageUrl' in body) data.imageUrl = body.imageUrl || null
    if (body.startDate) data.startDate = new Date(body.startDate)
    if ('endDate' in body) data.endDate = body.endDate ? new Date(body.endDate) : null
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive
    if (typeof body.publishToWebsite === 'boolean') {
      data.publishToWebsite = body.publishToWebsite
      const hasWebsiteDetails = [body.privateUniversityName, body.publicTitle, body.city, body.program].some(value => typeof value === 'string' && value.trim())
      if (hasWebsiteDetails) {
        try {
          const parsed = parseAdmissionOffer({
            ...body,
            publicTitle: body.title || existing.title,
            publicDescription: body.description || existing.description,
            status: body.publishToWebsite ? 'PUBLISHED' : 'DRAFT',
            startsAt: body.startDate || existing.startDate,
            endsAt: body.endDate === undefined ? existing.endDate : body.endDate,
          })
          const { status: _status, startsAt: _startsAt, endsAt: _endsAt, ...fields } = parsed
          Object.assign(data, fields)
        } catch (error) {
          return parseOfferError(error)
        }
      } else {
        data.publicTitle = body.title || existing.title
        data.publicDescription = body.description || existing.description
      }
    }

    const updated = await prisma.offer.update({ where: { id }, data })
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Failed to update offer' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getEffectiveUser(req)
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await orgHasFeature(user.organizationId, 'offers'))) {
      return NextResponse.json({ error: 'Offers is not included in your plan' }, { status: 403 })
    }

    const { id } = await params
    const existing = await prisma.offer.findUnique({ where: { id } })
    if (!existing || !isSameOrg(user, existing)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await prisma.offer.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete offer' }, { status: 500 })
  }
}
