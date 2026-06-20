import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface ActionMenuItem {
  label: string
  onClick: () => void
  icon?: ReactNode
  danger?: boolean
}

/** A vertical-ellipsis (⋮) button that opens a small action popover. Closes on
 * outside-click/Esc and flips above the button when there's no room below. */
export function ActionMenu({ items, label = 'Actions' }: { items: ActionMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const [up, setUp] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    const rect = ref.current?.getBoundingClientRect()
    if (rect) setUp(window.innerHeight - rect.bottom < 40 + items.length * 40 && rect.top > 200)
    setOpen((o) => !o)
  }

  return (
    <div className="actionmenu" ref={ref}>
      <button type="button" className="icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" />
        </svg>
      </button>
      {open ? (
        <div className={`actionmenu-pop${up ? ' up' : ''}`} role="menu">
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={`actionmenu-item${it.danger ? ' danger' : ''}`}
              onClick={() => {
                setOpen(false)
                it.onClick()
              }}
            >
              {it.icon ? <span className="ic">{it.icon}</span> : null}
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
