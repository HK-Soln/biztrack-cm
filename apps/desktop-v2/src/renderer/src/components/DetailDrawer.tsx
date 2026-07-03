import { useEffect, useState, type ReactNode } from 'react'
import { useT } from '@/i18n'
import { isWindows } from '@/lib/titlebar'

/**
 * Generic right-side detail drawer. Give it an `openId` (null = closed) and a render
 * function; the id stays rendered through the slide-out transition before unmounting.
 * The body provides its own header/content; the shell only adds the close button.
 * Closes on overlay click or Esc. Mirrors the SaleDetailDrawer animation pattern.
 */
export function DetailDrawer({
  openId,
  onClose,
  children,
}: {
  openId: string | null
  onClose: () => void
  children: (id: string) => ReactNode
}) {
  const t = useT()
  const [renderId, setRenderId] = useState<string | null>(openId)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (openId) {
      setRenderId(openId)
      const r = requestAnimationFrame(() => setOpen(true))
      return () => cancelAnimationFrame(r)
    }
    setOpen(false)
    const tmo = window.setTimeout(() => setRenderId(null), 260)
    return () => window.clearTimeout(tmo)
  }, [openId])

  useEffect(() => {
    if (!openId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, onClose])

  if (!renderId) return null
  return (
    <>
      <div className={`drawer-ov${open ? ' open' : ''}`} onClick={onClose} />
      <aside className={`drawer${open ? ' open' : ''}${isWindows ? ' below-titlebar' : ''}`} role="dialog" aria-modal="true">
        <div className="drawer-h" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="x" onClick={onClose} aria-label={t('common.close')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="drawer-b">{children(renderId)}</div>
      </aside>
    </>
  )
}
