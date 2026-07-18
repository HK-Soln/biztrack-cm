import type { ReactNode } from 'react'

/**
 * Brand-consistent screen for the app-level Next.js states (404 / error / global-error).
 * Deliberately self-contained: inline brand tokens + a scoped <style> so it renders correctly
 * even from global-error.tsx, which replaces the root layout and its CSS/fonts.
 */
const CSS = `
.es-wrap{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f5f7fb;font-family:var(--font-inter,'Inter',system-ui,-apple-system,Segoe UI,sans-serif);color:#2b3852}
.es-card{background:#fff;border:1px solid #e5eaf1;border-radius:22px;padding:44px 36px;max-width:460px;width:100%;text-align:center;box-shadow:0 20px 60px -20px rgba(11,31,58,.28)}
.es-mark{width:46px;height:46px;border-radius:12px;background:#16467a;color:#fff;display:inline-grid;place-items:center;font-family:var(--font-sora,'Sora',sans-serif);font-weight:700;font-size:22px;position:relative;margin:0 auto 22px}
.es-mark i{position:absolute;bottom:-3px;right:-3px;width:11px;height:11px;border-radius:50%;background:#f4a62a;border:2px solid #fff}
.es-code{font-family:var(--font-sora,'Sora',sans-serif);font-size:60px;font-weight:800;color:#16467a;letter-spacing:-.03em;line-height:1;margin-bottom:6px}
.es-card h1{font-family:var(--font-sora,'Sora',sans-serif);font-size:22px;font-weight:700;color:#101b30;letter-spacing:-.02em;margin:0 0 8px}
.es-card p{font-size:14.5px;line-height:1.6;color:#5a6884;margin:0 0 24px}
.es-acts{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.es-btn{display:inline-flex;align-items:center;justify-content:center;height:44px;padding:0 20px;border-radius:12px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;text-decoration:none;border:1px solid transparent;transition:filter .15s,background .15s}
.es-btn-primary{background:#16467a;color:#fff}
.es-btn-primary:hover{filter:brightness(1.09)}
.es-btn-ghost{background:#fff;color:#16467a;border-color:#d7e2f0}
.es-btn-ghost:hover{background:#eaf0f7}
.es-ref{margin-top:20px;font-size:12px;color:#8792a8}
.es-ref span{font-family:ui-monospace,Menlo,Consolas,monospace}
`

export function ErrorScreen({
  code,
  title,
  message,
  actions,
  digest,
}: {
  code?: string
  title: string
  message: string
  actions: ReactNode
  digest?: string
}) {
  return (
    <main className="es-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="es-card">
        <div className="es-mark">
          B<i />
        </div>
        {code ? <div className="es-code">{code}</div> : null}
        <h1>{title}</h1>
        <p>{message}</p>
        <div className="es-acts">{actions}</div>
        {digest ? (
          <div className="es-ref">
            Error reference: <span>{digest}</span>
          </div>
        ) : null}
      </div>
    </main>
  )
}
