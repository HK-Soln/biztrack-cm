import { useQuery } from '@tanstack/react-query'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'

// Proves renderer → typed IPC → main service → local SQLite, cached by TanStack.
export function HealthPanel() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => dataClient.skeleton.getHealth(),
  })

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 text-heading-sm text-foreground">Renderer → IPC → main → SQLite</h2>
      {!isElectron ? (
        <p className="text-body-md text-muted-foreground">
          Running in a browser (cloud-mode preview). Local SQLite + IPC are only available in the
          desktop app — run <code className="rounded bg-muted px-1">pnpm dev:desktop-v2</code>. The
          cloud HTTP adapter ships with the cloud build.
        </p>
      ) : isPending ? (
        <p className="text-body-md text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="text-body-md text-destructive">
          {error instanceof Error ? error.message : 'Failed to reach the main process.'}
        </p>
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
