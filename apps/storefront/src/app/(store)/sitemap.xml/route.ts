import type { NextRequest } from 'next/server'
import { listAllProductSlugs } from '@/lib/api'
import { slugFromHost } from '@/lib/store'
import { escapeXml, storeOrigin } from '@/lib/seo'

// Per-store, host-aware — must run per request, never cached at build.
export const dynamic = 'force-dynamic'

const xml = (body: string) =>
  new Response(body, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })

export async function GET(req: NextRequest) {
  const slug = slugFromHost(req.headers.get('host'))
  const origin = storeOrigin(req)
  if (!slug) {
    return xml(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n`,
    )
  }

  const productSlugs = await listAllProductSlugs(slug)
  const entries: Array<{ path: string; priority: string }> = [
    { path: '', priority: '1.0' },
    { path: '/products', priority: '0.8' },
    { path: '/contact', priority: '0.5' },
    ...productSlugs.map((s) => ({ path: `/products/${s}`, priority: '0.7' })),
  ]

  return xml(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      entries
        .map(
          (e) =>
            `  <url><loc>${escapeXml(`${origin}${e.path}`)}</loc><priority>${e.priority}</priority></url>`,
        )
        .join('\n') +
      `\n</urlset>\n`,
  )
}
