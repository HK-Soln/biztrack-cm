'use client'

import { useEffect } from 'react'
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

/**
 * Last boundary below the root layout. It catches what the (store) error boundary cannot: a
 * failure of the (store) layout itself, which in practice means the store fetch failed and the
 * API is unreachable. There is therefore no shop — so no header, footer, or brand colours, and
 * no "back to home" (home is the very thing that is broken). Retry is the only honest action.
 *
 * The `.store` wrapper is not decoration: every design token is scoped under it, so without it
 * this page would render with no colours at all. `data-brand="a"` is the neutral default.
 */
export default function RootError({
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
    <div className="store" data-brand="a">
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
            </div>

            {error.digest ? (
              <div className="err-ref">
                {t('reference')} <span className="mono">{error.digest}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
