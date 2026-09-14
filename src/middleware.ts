import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import type { NextRequest } from 'next/server'
import { requireAuthSecret } from './lib/authSecret'

const secret = requireAuthSecret()

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret })
  const { pathname } = request.nextUrl

  // Allow public routes
  const isPublicOffersRead = pathname === '/api/offers' && request.method === 'GET'
  const isChatbot = pathname === '/api/chatbot'
  // The marketing site and its trial signup are deliberately reachable while
  // signed out — they're how someone becomes a customer in the first place.
  const isMarketing = pathname === '/' || pathname === '/signup'
  if (
    pathname === '/login' ||
    isMarketing ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/public/') ||
    pathname === '/api/analytics/track' ||
    isPublicOffersRead ||
    isChatbot
  ) {
    // An already-signed-in visitor hitting /login goes to their dashboard;
    // the marketing pages stay readable to them, since an owner may well be
    // looking up pricing while logged in.
    if (token && pathname === '/login') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return NextResponse.next()
  }

  // Protect dashboard routes
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/api/')) {
    if (!token) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // SUPER_DEVELOPER platform console — the one place that must NOT pass
    // through the OWNER-equivalence below, since it's the operator's own
    // cross-org area, not something impersonation should ever grant.
    const superDeveloperOnlyPaths = ['/dashboard/platform', '/api/platform']
    if (superDeveloperOnlyPaths.some(p => pathname.startsWith(p)) && token.role !== 'SUPER_DEVELOPER') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // Middleware runs at the edge on the raw JWT only — it can't call
    // getEffectiveUser (Node runtime, needs Prisma) so it never sees the
    // impersonation-derived 'OWNER' remap. SUPER_DEVELOPER is allowed
    // through every OWNER gate explicitly here instead. Which *org's* data
    // a request actually sees is a separate concern, resolved per-route by
    // getEffectiveUser — middleware only decides whether the role tier may
    // reach the URL shape at all.
    const isOwnerTier = (role: string) => role === 'OWNER' || role === 'SUPER_DEVELOPER'

    // Admin dashboard - ADMIN and OWNER
    if (pathname.startsWith('/dashboard/admin') && token.role !== 'ADMIN' && !isOwnerTier(token.role as string)) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // OWNER-only routes: agents management, document requirements, field requirements.
    // /dashboard/portals is deliberately NOT here — an admin can be granted access to
    // it per-account (User.canViewPortals), so the page and its APIs do that finer
    // check themselves instead of middleware's blanket owner-only redirect.
    const ownerOnlyPaths = ['/dashboard/agents', '/dashboard/document-requirements', '/dashboard/field-requirements', '/dashboard/analytics']
    // Only mutating this data is OWNER-only — every agent needs to read requirement
    // lists and the user directory (e.g. to know what to upload, or filter by agent).
    // The routes themselves enforce the correct read permissions per role.
    const ownerOnlyApiPaths = ['/api/document-requirements', '/api/field-requirements', '/api/users']

    if (ownerOnlyPaths.some(p => pathname.startsWith(p)) && !isOwnerTier(token.role as string)) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    if (
      ownerOnlyApiPaths.some(p => pathname.startsWith(p)) &&
      request.method !== 'GET' &&
      !isOwnerTier(token.role as string)
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads/).*)']
}
