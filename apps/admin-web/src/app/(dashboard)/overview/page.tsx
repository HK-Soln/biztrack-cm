export default function OverviewPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-8 py-12">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.24em] text-neutral-500">
          Overview
        </p>
        <h1 className="text-3xl font-semibold text-neutral-900">
          Admin dashboard
        </h1>
        <p className="text-sm text-neutral-600">
          Replace this stub with the overview cards and charts from Sprint 2.
        </p>
      </header>
      <section className="grid gap-4 md:grid-cols-3">
        {['Total revenue', 'Active businesses', 'Open tickets'].map((label) => (
          <div
            className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
            key={label}
          >
            <p className="text-sm text-neutral-500">{label}</p>
            <p className="mt-4 text-2xl font-semibold text-neutral-900">—</p>
          </div>
        ))}
      </section>
    </main>
  )
}
