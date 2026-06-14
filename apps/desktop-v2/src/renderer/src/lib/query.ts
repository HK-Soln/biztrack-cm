import { QueryClient } from '@tanstack/react-query'

// Single client for the renderer SPA (no SSR -> no per-request client).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
})

export const queryKeys = {
  health: ['health'] as const,
  skeletonCheck: ['skeleton-check'] as const,
}
