import { QueryClient, environmentManager } from '@tanstack/react-query'

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Storefront data is fairly stable within a browsing session; refetch on
        // demand. The server prefetch hydrates the first paint (full SSR).
        staleTime: 60_000,
        retry: 1,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

/**
 * A fresh client per server request (so requests never share cache/state), and a
 * singleton in the browser (so client-side navigation reuses the hydrated cache).
 */
export function getQueryClient(): QueryClient {
  if (environmentManager.isServer()) return makeQueryClient()
  if (!browserQueryClient) browserQueryClient = makeQueryClient()
  return browserQueryClient
}

export const queryKeys = {
  products: (slug: string, query: unknown) => ['products', slug, query] as const,
  product: (slug: string, productSlug: string) => ['product', slug, productSlug] as const,
  categories: (slug: string) => ['categories', slug] as const,
  facets: (slug: string, categoryIds: string[]) => ['facets', slug, categoryIds] as const,
  cart: (slug: string, sessionToken: string) => ['cart', slug, sessionToken] as const,
}
