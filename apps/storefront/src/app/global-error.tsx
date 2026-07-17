'use client'

import { useEffect } from 'react'
import './globals.css'

const IcWarning = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4.5M12 17h.01" />
  </svg>
)

/**
 * Last resort: the root layout itself failed, so this replaces it and must supply its own
 * <html>/<body>.
 *
 * Deliberately self-contained. The root layout is what mounts NextIntlClientProvider, so
 * `useTranslations` cannot work here — the copy is hardcoded in French, the product's default
 * locale (see src/i18n/request.ts), because the thing that resolves locale is exactly what broke.
 * Reloading, not translating, is the job of this page.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="fr">
      <body>
        <div className="store" data-brand="a">
          <div className="wrap">
            <div className="err">
              <div className="err-in">
                <div className="err-ico">{IcWarning}</div>
                <h1>Oups, un problème est survenu</h1>
                <p>
                  La boutique rencontre une difficulté technique passagère. Réessayez dans un
                  instant.
                </p>
                <div className="err-acts">
                  <button className="btn btn-primary btn-lg" type="button" onClick={reset}>
                    Réessayer
                  </button>
                </div>
                {error.digest ? (
                  <div className="err-ref">
                    Référence de l&apos;erreur : <span className="mono">{error.digest}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
