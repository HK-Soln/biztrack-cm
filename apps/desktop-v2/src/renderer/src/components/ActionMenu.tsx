import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface ActionMenuItem {
  label: string
  onClick: () => void
  icon?: ReactNode
  danger?: boolean
}

const MENU_WIDTH = 200

/** A vertical-ellipsis (⋮) button that opens a small action popover. The popover is
 * rendered in a portal with fixed positioning computed from the trigger, so it is never
 * clipped by a table/panel's overflow; it flips above the button and clamps horizontally
 * when there isn't room. Closes on outside-click / Esc / scroll. */
export function ActionMenu({ items, label = 'Actions' }: { items: ActionMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const place = () => {
    const rect = btnRef.current?.getBoundingClientRect()
    if (!rect) return
    const menuH = 10 + items.length * 38
    const spaceBelow = window.innerHeight - rect.bottom
    const up = spaceBelow < menuH + 10 && rect.top > menuH
    const top = up ? Math.max(8, rect.top - menuH - 6) : rect.bottom + 6
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8))
    setPos({ top, left })
  }

  const toggle = () => {
    if (!open) place()
    setOpen((o) => !o)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  return (
    <div className="actionmenu">
      <button type="button" ref={btnRef} className="icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" />
        </svg>
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={menuRef}
              className="actionmenu-pop"
              role="menu"
              style={{ position: 'fixed', top: pos.top, left: pos.left, width: MENU_WIDTH, zIndex: 200 }}
            >
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
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
