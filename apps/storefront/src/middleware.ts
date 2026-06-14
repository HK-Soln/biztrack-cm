import { NextResponse, type NextRequest } from 'next/server'

/**
 * Subdomain routing: akwa.biztrack.cm/products → /akwa/products.
 * Path routing (biztrack.cm/akwa/...) is handled natively by the [slug] segment,
 * so requests that already carry a slug path are left untouched.
 */
const ROOT_DOMAINS = ['biztrack.cm', 'localhost']

export function middleware(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').split(':')[0] ?? ''
  const { pathname } = request.nextUrl

  // Skip Next internals and static assets.
  if (pathname.startsWith('/_next') || pathname.includes('.')) {
    return NextResponse.next()
  }

  const rootDomain = ROOT_DOMAINS.find((domain) => host === domain || host.endsWith(`.${domain}`))
  if (!rootDomain || host === rootDomain) {
    return NextResponse.next()
  }

  const subdomain = host.slice(0, host.length - rootDomain.length - 1)
  if (!subdomain || subdomain === 'www') {
    return NextResponse.next()
  }

  // Rewrite the subdomain into the [slug] segment.
  const url = request.nextUrl.clone()
  url.pathname = `/${subdomain}${pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
