/**
 * Root loading UI — shown during route transitions / server-render suspense.
 * Self-contained brand spinner (no dependency on site CSS).
 */
const CSS = `
.ld-wrap{min-height:100dvh;display:flex;align-items:center;justify-content:center;background:#f5f7fb}
.ld-spin{width:38px;height:38px;border-radius:50%;border:3px solid #d7e2f0;border-top-color:#16467a;animation:ld-rot .8s linear infinite}
@keyframes ld-rot{to{transform:rotate(360deg)}}
`

export default function Loading() {
  return (
    <div className="ld-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="ld-spin" role="status" aria-label="Loading" />
    </div>
  )
}
