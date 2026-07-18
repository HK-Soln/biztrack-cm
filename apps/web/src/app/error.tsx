'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { ErrorScreen } from './_components/ErrorScreen'

/**
 * Route-segment error boundary — catches render/runtime errors in the page tree and
 * offers a recovery (reset) without a full reload. The root layout is preserved.
 */
export default function Error({
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
    <ErrorScreen
      title="Something went wrong"
      message="An unexpected error occurred while loading this page. Please try again, or head back home."
      digest={error.digest}
      actions={
        <>
          <button className="es-btn es-btn-primary" type="button" onClick={() => reset()}>
            Try again
          </button>
          <Link className="es-btn es-btn-ghost" href="/">
            Back to home
          </Link>
        </>
      }
    />
  )
}
