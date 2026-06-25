'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { toast } from 'sonner'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const res = await signIn('credentials', { email, password, redirect: false })
    setSubmitting(false)

    if (res?.ok) {
      const callbackUrl = searchParams.get('callbackUrl') ?? '/overview'
      router.push(callbackUrl)
      router.refresh()
    } else {
      toast.error('Invalid email or password.')
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-neutral-900">Admin sign in</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Use your BizTrack CM admin credentials to continue.
        </p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="flex flex-col gap-2 text-sm text-neutral-700">
            Email
            <input
              className="rounded-xl border border-neutral-300 px-3 py-2 text-neutral-900"
              placeholder="admin@biztrack.cm"
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-neutral-700">
            Password
            <input
              className="rounded-xl border border-neutral-300 px-3 py-2 text-neutral-900"
              placeholder="••••••••"
              type="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          <button
            className="w-full rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  )
}
