import { NextResponse, type NextRequest } from 'next/server'
import { isStoreRootHost, MARKETING_URL } from '@/lib/host'

/**
 * The storefront only ever serves shops, one per subdomain (`<slug>.<root>`). The root domain
 * itself — and its `www` alias — carry no shop, so they go to the marketing site. A slug that
 * matches no store is handled in the (store) layout, which needs an API call to know.
 */
export function middleware(req: NextRequest) {
  // Temporary (307): the root is only parked here. Never 308 — browsers cache permanent
  // redirects indefinitely, which would strand the domain if it ever needs to serve its own page.
  if (isStoreRootHost(req.headers.get('host'))) {
    return NextResponse.redirect(MARKETING_URL, 307)
  }
  return NextResponse.next()
}

export const config = {
  // Every page/route, minus build assets — the redirect is about the host, not the path.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
