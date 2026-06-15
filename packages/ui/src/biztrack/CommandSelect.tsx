'use client'
import * as React from 'react'

export interface CommandSelectOption {
  value: string
  label: string
  sublabel?: string
}

export interface CommandSelectProps {
  value: string | null
  /** Label shown when collapsed (parent resolves it from the current value). */
  valueLabel?: string | null
  onChange: (value: string | null, option?: CommandSelectOption) => void
  /** Async loader — called (debounced) with the search term. SHOULD hit the DB. */
  loadOptions: (search: string) => Promise<CommandSelectOption[]>
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  loadingText?: string
  /** Show a "clear" row at the top of the list with this label (e.g. "None"). */
  clearLabel?: string
  disabled?: boolean
  invalid?: boolean
}

/**
 * Searchable select: a button + popover with a command list. The search is async via
 * `loadOptions`, so filtering happens in the data source (local SQLite / API) — not
 * just the loaded page. Debounced, keyboard-navigable, closes on outside-click/Esc.
 */
export function CommandSelect({
  value,
  valueLabel,
  onChange,
  loadOptions,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No results',
  loadingText = 'Loading…',
  clearLabel,
  disabled,
  invalid,
}: CommandSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [options, setOptions] = React.useState<CommandSelectOption[]>([])
  const [loading, setLoading] = React.useState(false)
  const [active, setActive] = React.useState(0)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const reqId = React.useRef(0)

  // Load (debounced) whenever the popover is open and the search changes.
  React.useEffect(() => {
    if (!open) return
    const id = ++reqId.current
    setLoading(true)
    const handle = setTimeout(() => {
      loadOptions(search.trim())
        .then((opts) => {
          if (reqId.current === id) {
            setOptions(opts)
            setActive(0)
          }
        })
        .finally(() => {
          if (reqId.current === id) setLoading(false)
        })
    }, 220)
    return () => clearTimeout(handle)
  }, [open, search, loadOptions])

  // Close on outside click / Esc; focus the search on open.
  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    inputRef.current?.focus()
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const rows: Array<CommandSelectOption | { clear: true }> = clearLabel
    ? [{ clear: true }, ...options]
    : options

  const pick = (row: CommandSelectOption | { clear: true }) => {
    if ('clear' in row) onChange(null)
    else onChange(row.value, row)
    setOpen(false)
    setSearch('')
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return setOpen(false)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const row = rows[active]
      if (row) pick(row)
    }
  }

  return (
    <div className="cmdsel" ref={rootRef}>
      <button
        type="button"
        className={`cmdsel-trigger${invalid ? ' invalid' : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <span className={valueLabel ? 'cmdsel-val' : 'cmdsel-ph'}>{valueLabel || placeholder}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="cmdsel-chev">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div className="cmdsel-pop" role="listbox">
          <div className="cmdsel-search">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <circle cx="9" cy="9" r="6" />
              <path d="m14 14 3 3" />
            </svg>
            <input
              ref={inputRef}
              value={search}
              placeholder={searchPlaceholder}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
          <div className="cmdsel-list">
            {loading ? (
              <div className="cmdsel-empty">{loadingText}</div>
            ) : rows.length === 0 ? (
              <div className="cmdsel-empty">{emptyText}</div>
            ) : (
              rows.map((row, i) => {
                const isClear = 'clear' in row
                const selected = isClear ? value == null : row.value === value
                return (
                  <button
                    key={isClear ? '__clear' : row.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`cmdsel-opt${i === active ? ' active' : ''}${selected ? ' sel' : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(row)}
                  >
                    <span className="cmdsel-opt-main">
                      <span className="cmdsel-opt-label">{isClear ? clearLabel : row.label}</span>
                      {!isClear && row.sublabel ? <span className="cmdsel-opt-sub">{row.sublabel}</span> : null}
                    </span>
                    {selected ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="cmdsel-check">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    ) : null}
                  </button>
                )
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
