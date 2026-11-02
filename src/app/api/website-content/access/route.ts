import { NextRequest, NextResponse } from 'next/server'
import { getEffectiveUser } from '@/src/lib/session'
import { canManageSiteContent } from '@/src/lib/siteContentAccess'
export async function GET(req: NextRequest) { return NextResponse.json({ allowed: canManageSiteContent(await getEffectiveUser(req)) }) }
