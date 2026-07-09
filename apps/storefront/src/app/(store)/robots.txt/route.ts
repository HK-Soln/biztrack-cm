import type { NextRequest } from 'next/server'
import { storeOrigin } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const origin = storeOrigin(req)
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /cart',
    'Disallow: /checkout',
    'Disallow: /orders/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
