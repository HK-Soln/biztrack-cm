import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient, queryKeys } from '@/lib/query'
import { getProductCount, getSkeletonCheck } from '@/server/bff/skeleton'
import { AppShell } from '@/components/layout/AppShell'
import { HealthPanel } from '@/components/HealthPanel'

// Dynamic (SSR on every request) — the page server-reads local SQLite at request
// time, which is the whole point: offline-first SSR, no static export.
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  // Server-side read straight from local SQLite via the BFF + DataSource adapter.
  const check = await getSkeletonCheck()

  // Prefetch the health query server-side and hand the cache to the client.
  const queryClient = getQueryClient()
  const [productCount, healthCheck] = await Promise.all([getProductCount(), getSkeletonCheck()])
  queryClient.setQueryData(queryKeys.health, {
    ok: true,
    productCount,
    skeletonValue: healthCheck?.value ?? null,
    source: 'local-sqlite',
  })

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-1 text-heading-sm text-foreground">Server-rendered from SQLite</h2>
          <p className="mb-3 text-body-sm text-muted-foreground">
            This value was read on the server at request time and baked into the HTML.
          </p>
          <p className="rounded-lg bg-muted px-4 py-3 font-mono text-body-md text-foreground">
            {check ? `${check.value}  ·  ${check.checkedAt}` : 'No _skeleton_check row — run pnpm seed:dev'}
          </p>
        </section>

        <HydrationBoundary state={dehydrate(queryClient)}>
          <HealthPanel />
        </HydrationBoundary>
      </div>
    </AppShell>
  )
}
