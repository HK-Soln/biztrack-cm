import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'

export interface FilterSelectOption {
  value: string
  label: string
  /** Optional leading status dot colour (CSS colour / var). */
  dot?: string
}

export interface FilterSelectProps {
  value: string
  options: FilterSelectOption[]
  onChange: (value: string) => void
  ariaLabel?: string
  minWidth?: number
}

const CHEV = (
  <svg className="fsel-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="m6 9 6 6 6-6" /></svg>
)
const CHECK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}><path d="m5 12 4 4L19 6" /></svg>
)

/**
 * A compact popover dropdown for filter toolbars — a styled trigger (value + optional status
 * dot + chevron) that opens a menu with a checkmark on the active option. Nicer + more
 * consistent than a native <select>; closes on outside-click / Esc.
 */
export function FilterSelect({ value, options, onChange, ariaLabel, minWidth = 150 }: FilterSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const sel = options.find((o) => o.value === value) ?? options[0]

  return (
    <div className="fsel" ref={ref} style={{ minWidth }}>
      <button type="button" className={clsx('fsel-trigger', open && 'open')} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {sel?.dot ? <span className="fsel-dot" style={{ background: sel.dot }} /> : null}
        <span className="fsel-val">{sel?.label ?? ''}</span>
        {CHEV}
      </button>
      {open ? (
        <div className="fsel-pop" role="listbox">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={clsx('fsel-opt', o.value === value && 'sel')}
              onClick={() => { onChange(o.value); setOpen(false) }}
            >
              {o.dot ? <span className="fsel-dot" style={{ background: o.dot }} /> : null}
              <span className="fsel-opt-label">{o.label}</span>
              <span className="fsel-check">{o.value === value ? CHECK : null}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
