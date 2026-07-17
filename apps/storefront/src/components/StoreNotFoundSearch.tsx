'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

const IcSearch = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)

/** Search box on the store 404 — a dead end is the one place a customer most needs to search. */
export function StoreNotFoundSearch() {
  const router = useRouter()
  const t = useTranslations('notFound')
  const [q, setQ] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const query = q.trim()
    router.push(`/products${query ? `?search=${encodeURIComponent(query)}` : ''}`)
  }

  return (
    <form className="err-search" onSubmit={submit}>
      <div className="fld">
        {IcSearch}
        <input
          placeholder={t('searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t('searchPlaceholder')}
        />
      </div>
      <button className="btn btn-primary" type="submit">
        {t('search')}
      </button>
    </form>
  )
}
