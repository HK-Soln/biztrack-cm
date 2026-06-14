import { useQuery } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { HealthPanel } from '@/components/HealthPanel'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'

export function Home() {
  const { data: check, isPending } = useQuery({
    queryKey: queryKeys.skeletonCheck,
    queryFn: () => dataClient.skeleton.getCheck(),
  })

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-1 text-heading-sm text-foreground">Read from local SQLite</h2>
          <p className="mb-3 text-body-sm text-muted-foreground">
            Fetched over a typed IPC call into the main-process service — no API, fully offline.
          </p>
          <p className="rounded-lg bg-muted px-4 py-3 font-mono text-body-md text-foreground">
            {isPending
              ? 'Loading…'
              : check
                ? `${check.value}  ·  ${check.checkedAt}`
                : 'No _skeleton_check row.'}
          </p>
        </section>

        <HealthPanel />
      </div>
    </AppShell>
  )
}
