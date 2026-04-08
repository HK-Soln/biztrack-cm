export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-neutral-900">
          Admin sign in
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          Use your BizTrack CM admin credentials to continue.
        </p>
        <form className="mt-6 space-y-4">
          <label className="flex flex-col gap-2 text-sm text-neutral-700">
            Email
            <input
              className="rounded-xl border border-neutral-300 px-3 py-2 text-neutral-900"
              placeholder="admin@biztrack.cm"
              type="email"
              name="email"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-neutral-700">
            Password
            <input
              className="rounded-xl border border-neutral-300 px-3 py-2 text-neutral-900"
              placeholder="••••••••"
              type="password"
              name="password"
            />
          </label>
          <button
            className="w-full rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
            type="submit"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  )
}
