import { useEffect } from 'react'

/**
 * Keyboard navigation for the Receive Stock wizard. Modifier combos only, so they never
 * interfere with typing quantities, scanning serials, or the barcode scanner:
 *   Alt+→ next · Alt+← previous · Ctrl/⌘+Enter confirm (on the last step)
 * Pass `enabled: false` while a modal (e.g. quick-create) is open.
 */
export function useStepKeys(opts: {
  enabled: boolean
  onNext: () => void
  onPrev: () => void
  onConfirm: () => void
}): void {
  const { enabled, onNext, onPrev, onConfirm } = opts
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        onNext()
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        onPrev()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        onConfirm()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, onNext, onPrev, onConfirm])
}
