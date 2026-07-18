import type { Metadata } from 'next'
import Link from 'next/link'
import { ErrorScreen } from './_components/ErrorScreen'

export const metadata: Metadata = {
  title: 'Page not found · BizTrack CM',
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <ErrorScreen
      code="404"
      title="Page not found"
      message="The page you're looking for doesn't exist or may have moved. Let's get you back on track."
      actions={
        <>
          <Link className="es-btn es-btn-primary" href="/">
            Back to home
          </Link>
          <Link className="es-btn es-btn-ghost" href="/contact">
            Contact us
          </Link>
        </>
      }
    />
  )
}
