import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useT } from '@/i18n'

/**
 * Bottom sheet for mobile detail views (sale receipt, contact statement). Mounts
 * only while open; overlay-click and Esc close it. Matches the design's `.msheet`
 * chrome (grab handle + header + scrollable body). Conditional-mount, no slide
 * animation — consistent with the Sell ticket sheet.
 */
export function MobileSheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const t = useT()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="msheet-ov" onClick={onClose} />
      <div className="msheet" role="dialog" aria-modal="true" style={{ maxHeight: '90%' }}>
        <div className="grab" />
        <div className="sh-h">
          <h3>{title}</h3>
          <button type="button" className="m-ic" onClick={onClose} aria-label={t('common.close')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="sh-b">{children}</div>
      </div>
    </>
  )
}
