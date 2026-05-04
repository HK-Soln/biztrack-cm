import { redirect } from 'next/navigation'
import { getCachedSession } from '@/lib/permissions/server'
import { pickFirstPermittedRoute } from '@/config/routes'

export default async function DashboardPage() {
  const session = await getCachedSession()
  const permissions = session?.admin?.permissions ?? []
  const isSuperAdmin = session?.admin?.isSuperAdmin ?? false

  const first = pickFirstPermittedRoute(permissions, isSuperAdmin)

  if (!first) {
    return (
      <div className="mx-auto max-w-md rounded-lg border bg-card p-8 text-center text-card-foreground shadow-sm">
        <h1 className="text-lg font-semibold">No accessible sections</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account doesn&apos;t have access to any admin sections. Please contact a super admin
          to grant the required permissions.
        </p>
      </div>
    )
  }

  redirect(first.path)
}
