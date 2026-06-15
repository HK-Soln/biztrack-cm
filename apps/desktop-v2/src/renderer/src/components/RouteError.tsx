import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom'
import { Button } from '@biztrack/ui/biztrack'
import { useT } from '@/i18n'

// Global router error boundary (errorElement). React Router throws a 404 for
// unmatched routes, so this one element handles both "page not found" and any
// error thrown while rendering/loading a route — instead of the dev-only default.
export function RouteError() {
  const error = useRouteError()
  const navigate = useNavigate()
  const t = useT()

  const is404 = isRouteErrorResponse(error) && error.status === 404
  const detail =
    error instanceof Error
      ? error.message
      : isRouteErrorResponse(error)
        ? `${error.status} ${error.statusText}`
        : ''

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--canvas)', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 440 }}>
        <div
          style={{
            width: 64,
            height: 64,
            margin: '0 auto 18px',
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            background: 'var(--inset)',
            color: 'var(--text-muted)',
          }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
          {is404 ? t('error.notFoundTitle') : t('error.title')}
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.6 }}>
          {is404 ? t('error.notFoundBody') : t('error.body')}
        </p>
        {!is404 && detail ? (
          <pre
            style={{
              marginTop: 14,
              padding: '10px 12px',
              background: 'var(--inset)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              fontSize: 11.5,
              color: 'var(--text-2)',
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 140,
              overflow: 'auto',
            }}
          >
            {detail}
          </pre>
        ) : null}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
          <Button variant="soft" onClick={() => window.location.reload()}>
            {t('error.reload')}
          </Button>
          <Button variant="primary" onClick={() => navigate('/', { replace: true })}>
            {t('error.goHome')}
          </Button>
        </div>
      </div>
    </div>
  )
}
