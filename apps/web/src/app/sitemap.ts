import type { MetadataRoute } from 'next'

const BASE = 'https://hk-solutions.app'

const ROUTES = [
  '',
  '/features',
  '/pricing',
  '/download',
  '/about',
  '/faq',
  '/contact',
  '/blog',
  '/privacy',
  '/terms',
]

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((path) => ({
    url: `${BASE}${path}`,
    changeFrequency: path === '' || path === '/blog' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : path === '/privacy' || path === '/terms' ? 0.3 : 0.7,
  }))
}
