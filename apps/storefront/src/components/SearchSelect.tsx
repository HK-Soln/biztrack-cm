'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export interface SearchSelectOption {
  value: string
  label: string
}

/**
 * A searchable popover select for the storefront (no native <select>): a button that opens a filterable
 * list. Styled with the store CSS tokens so it matches the .field/.input controls. Keyboard: type to
 * filter, ↑/↓ to move, Enter to pick, Esc to close.
 */
export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No results',
  disabled = false,
}: {
  value: string
  onChange: (value: string, option?: SearchSelectOption) => void
  options: SearchSelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value) ?? null
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? options.filter((o) => o.label.toLowerCase().includes(s)) : options
  }, [q, options])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.clearTimeout(id)
    }
  }, [open])

  useEffect(() => setActive(0), [q, open])

  const pick = (o: SearchSelectOption) => {
    onChange(o.value, o)
    setOpen(false)
    setQ('')
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="input"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        style={{
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span
          style={{
            color: selected ? 'var(--text)' : 'var(--muted, #8a93a1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {selected?.label ?? placeholder}
        </span>
        <span style={{ color: 'var(--muted, #8a93a1)', flexShrink: 0 }} aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 40,
            background: 'var(--surface, #fff)',
            border: '1px solid var(--border, rgba(0,0,0,0.14))',
            borderRadius: 10,
            boxShadow: '0 10px 30px rgba(0,0,0,0.14)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: 8, borderBottom: '1px solid var(--border, rgba(0,0,0,0.1))' }}>
            <input
              ref={inputRef}
              className="input"
              style={{ height: 38 }}
              value={q}
              placeholder={searchPlaceholder}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false)
                else if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActive((a) => Math.min(filtered.length - 1, a + 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActive((a) => Math.max(0, a - 1))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  const o = filtered[active]
                  if (o) pick(o)
                }
              }}
            />
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 12px', color: 'var(--muted, #8a93a1)', fontSize: 13 }}>
                {emptyText}
              </div>
            ) : (
              filtered.map((o, i) => (
                <button
                  key={o.value}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '9px 12px',
                    fontSize: 13.5,
                    border: 0,
                    cursor: 'pointer',
                    color: 'var(--text)',
                    background:
                      o.value === value
                        ? 'var(--brand-soft, rgba(0,0,0,0.06))'
                        : i === active
                          ? 'var(--inset, rgba(0,0,0,0.04))'
                          : 'transparent',
                  }}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
