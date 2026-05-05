export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display-sm">Overview</h1>
        <p className="text-muted-foreground">Platform health and key metrics</p>
      </div>

      {/* Stat cards and content will be built in Milestone 2 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <p className="text-sm text-muted-foreground">Total Businesses</p>
          <p className="mt-2 text-2xl font-bold">—</p>
        </div>
        <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <p className="text-sm text-muted-foreground">Active Today</p>
          <p className="mt-2 text-2xl font-bold">—</p>
        </div>
        <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <p className="text-sm text-muted-foreground">Open Tickets</p>
          <p className="mt-2 text-2xl font-bold">—</p>
        </div>
        <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <p className="text-sm text-muted-foreground">Failed Payments</p>
          <p className="mt-2 text-2xl font-bold">—</p>
        </div>
      </div>
    </div>
  )
}
