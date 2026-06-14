import { useQuery } from '@tanstack/react-query'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'

// Proves renderer → typed IPC → main service → local SQLite, cached by TanStack.
export function HealthPanel() {
  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => dataClient.skeleton.getHealth(),
  })

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 text-heading-sm text-foreground">Renderer → IPC → main → SQLite</h2>
      {isPending ? (
        <p className="text-body-md text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="text-body-md text-destructive">Failed to reach the main process.</p>
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
