export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start gap-6 px-8 py-16">
      <div>
        <p className="text-sm uppercase tracking-[0.24em] text-neutral-500">
          BizTrack CM
        </p>
        <h1 className="mt-4 text-4xl font-semibold text-neutral-900">
          Admin dashboard scaffold
        </h1>
        <p className="mt-3 text-base text-neutral-600">
          The admin web app is ready for auth, role-based routing, and the
          dashboard shell.
        </p>
      </div>
      <div className="flex flex-wrap gap-3 text-sm text-neutral-700">
        <a
          className="rounded-full border border-neutral-300 px-4 py-2 hover:border-neutral-900"
          href="/login"
        >
          Go to login
        </a>
        <a
          className="rounded-full border border-neutral-300 px-4 py-2 hover:border-neutral-900"
          href="/overview"
        >
          View overview stub
        </a>
      </div>
    </main>
  )
}
