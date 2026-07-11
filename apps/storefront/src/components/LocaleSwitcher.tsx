'use client'

import { useTransition } from 'react'
import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'

const OPTIONS = [
  { code: 'fr', label: 'FR' },
  { code: 'en', label: 'EN' },
] as const

/**
 * Cookie-based language toggle (no URL routing — the path/subdomain already carries
 * the store slug). Sets `NEXT_LOCALE` then refreshes so the server re-renders (SSR)
 * with the new locale.
 */
export function LocaleSwitcher() {
  const active = useLocale()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const setLocale = (code: string) => {
    if (code === active) return
    document.cookie = `NEXT_LOCALE=${code};path=/;max-age=31536000;samesite=lax`
    startTransition(() => router.refresh())
  }

  return (
    <div className="loc-switch" role="group" aria-label="Language">
      {OPTIONS.map((opt) => (
        <button
          key={opt.code}
          type="button"
          className={opt.code === active ? 'on' : undefined}
          disabled={pending}
          onClick={() => setLocale(opt.code)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
