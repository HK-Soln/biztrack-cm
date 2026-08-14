import { clsx } from 'clsx'
import { useEffect, type ReactNode } from 'react'

// Design-system modal/dialog. Overlay + centred card; closes on Escape and backdrop
// click. Pair with @biztrack/ui/styles.css (.modal-*).
export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  /** Extra class on the overlay — e.g. to raise its stacking layer above another
   * open modal (a manager step-up prompt must sit above the payment sheet). */
  overlayClassName?: string
  /** When false, a backdrop click and Escape do NOT close the modal — the user must use
   * the close icon or an explicit action. Default true. */
  dismissable?: boolean
  /** When set, body + footer are wrapped in a <form> so Enter submits. Pair the
   * primary footer action with type="submit". */
  onSubmit?: () => void
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className,
  overlayClassName,
  dismissable = true,
  onSubmit,
}: ModalProps) {
  useEffect(() => {
    if (!open || !dismissable) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, dismissable])

  if (!open) return null
  return (
    <div
      className={clsx('modal-overlay', overlayClassName)}
      onMouseDown={dismissable ? onClose : undefined}
    >
      <div
        className={clsx('modal', className)}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title ? (
          <div className="modal-head">
            <h2>{title}</h2>
            <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        ) : null}
        {onSubmit ? (
          <form
            style={{ display: 'contents' }}
            onSubmit={(e) => {
              e.preventDefault()
              onSubmit()
            }}
          >
            <div className="modal-body">{children}</div>
            {footer ? <div className="modal-foot">{footer}</div> : null}
          </form>
        ) : (
          <>
            <div className="modal-body">{children}</div>
            {footer ? <div className="modal-foot">{footer}</div> : null}
          </>
        )}
      </div>
    </div>
  )
}
