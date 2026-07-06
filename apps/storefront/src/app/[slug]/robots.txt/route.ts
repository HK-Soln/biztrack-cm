import type { NextRequest } from 'next/server'
import { storeUrls } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { base } = storeUrls(req, slug)
  // On a subdomain, base === origin so paths are '/cart' etc.; on path access they carry
  // the '/{slug}' prefix. Derive the prefix from base to keep both correct.
  const prefix = base.replace(/^https?:\/\/[^/]+/, '')

  const body = [
    'User-agent: *',
    'Allow: /',
    `Disallow: ${prefix}/cart`,
    `Disallow: ${prefix}/checkout`,
    `Disallow: ${prefix}/orders/`,
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
