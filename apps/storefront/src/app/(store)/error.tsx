'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

const IcWarning = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4.5M12 17h.01" />
  </svg>
)
const IcRetry = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M21 11.5a8.5 8.5 0 1 1-4-7.2M21 4v4h-4" />
  </svg>
)
const IcMessage = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M4 5h16v12H7l-3 3V5Z" />
  </svg>
)

/**
 * Error boundary for pages inside a store. It renders within the (store) layout, so the shop's
 * header and footer stay on screen — the store itself loaded fine, only this page failed.
 *
 * A failure of the layout's own store fetch (the API being unreachable) cannot be caught here;
 * that lands in app/error.tsx, which has no shop to render chrome for.
 */
export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('error')

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="wrap">
      <div className="err">
        <div className="err-in">
          <div className="err-ico">{IcWarning}</div>
          <div className="err-code-sm">{t('code', { status: 500 })}</div>
          <h1>{t('title')}</h1>
          <p>{t('body')}</p>

          <div className="err-acts">
            <button className="btn btn-primary btn-lg" type="button" onClick={reset}>
              {IcRetry}
              {t('retry')}
            </button>
            <Link className="btn btn-lg" href="/">
              {t('home')}
            </Link>
          </div>

          <div className="err-note">
            {IcMessage}
            <span>
              {t('persists')} <Link href="/contact">{t('contact')}</Link>
            </span>
          </div>

          {/* Next's digest is the real version of the design's error reference — it is the only
              id that actually correlates with a server log, so it is shown only when present. */}
          {error.digest ? (
            <div className="err-ref">
              {t('reference')} <span className="mono">{error.digest}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
