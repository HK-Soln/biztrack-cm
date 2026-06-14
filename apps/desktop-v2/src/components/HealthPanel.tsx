'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchHealth } from '@/lib/api-client'
import { queryKeys } from '@/lib/query'

// Client component: proves the client → BFF → SQLite round trip. The data is
// SSR-prefetched and hydrated, so this paints instantly with no refetch flash.
export function HealthPanel() {
  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.health,
    queryFn: fetchHealth,
  })

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 text-heading-sm text-foreground">Client → BFF (TanStack Query)</h2>
      {isPending ? (
        <p className="text-body-md text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="text-body-md text-destructive">Failed to reach the BFF.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-3 text-body-md">
          <dt className="text-muted-foreground">Products in local SQLite</dt>
          <dd className="text-foreground">{data?.productCount}</dd>
          <dt className="text-muted-foreground">Source</dt>
          <dd className="text-foreground">{data?.source}</dd>
          <dt className="text-muted-foreground">Skeleton value</dt>
          <dd className="text-foreground">{data?.skeletonValue ?? '—'}</dd>
        </dl>
      )}
    </section>
  )
}
