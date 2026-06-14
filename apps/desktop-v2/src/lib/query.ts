import { QueryClient, environmentManager } from '@tanstack/react-query'

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

/**
 * Fresh client per server request (no shared cache across requests), singleton in
 * the browser (client-side navigation reuses the SSR-hydrated cache).
 */
export function getQueryClient(): QueryClient {
  if (environmentManager.isServer()) return makeQueryClient()
  if (!browserQueryClient) browserQueryClient = makeQueryClient()
  return browserQueryClient
}

export const queryKeys = {
  health: ['health'] as const,
}
