'use client'

import { useEffect } from 'react'
import { ErrorScreen } from './_components/ErrorScreen'

/**
 * Last-resort boundary: the root layout itself threw, so this replaces it and must render
 * its own <html>/<body>. Fonts/global CSS from the root layout are unavailable here, which
 * is why ErrorScreen ships its own self-contained styles.
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
    <html lang="en">
      <body>
        <ErrorScreen
          title="Something went wrong"
          message="The site hit an unexpected error. Reloading usually fixes it — if it keeps happening, please contact us."
          digest={error.digest}
          actions={
            <button className="es-btn es-btn-primary" type="button" onClick={() => reset()}>
              Reload
            </button>
          }
        />
      </body>
    </html>
  )
}
