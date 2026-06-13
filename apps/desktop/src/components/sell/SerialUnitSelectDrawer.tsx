'use client'

import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@biztrack/ui'
import { cn } from '@/lib/utils'
import type { SellSerialUnit } from '@/services/products.local'

interface SerialUnitSelectDrawerProps {
  open: boolean
  title: string
  units: SellSerialUnit[]
  loading?: boolean
  onClose: () => void
  onSelect: (unit: SellSerialUnit) => void
}

const formatWarranty = (iso: string | null) => {
  if (!iso) return 'No warranty'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'No warranty'
  return `Warranty: ${date.toLocaleDateString('fr-FR')}`
}

/**
 * Sell-screen serial/IMEI selector (Phase 3G). Lists IN_STOCK units, supports
 * search (and scanned values via the same field), and selects one unit.
 */
export function SerialUnitSelectDrawer({
  open,
  title,
  units,
  loading = false,
  onClose,
  onSelect,
}: SerialUnitSelectDrawerProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return units
    return units.filter((unit) => unit.serialNumber.toLowerCase().includes(term))
  }, [units, search])

  if (!open) return null

  const close = () => {
    setSearch('')
    onClose()
  }

  const select = (unit: SellSerialUnit) => {
    setSearch('')
    onSelect(unit)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={close} />
      <div className="relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-card p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">
              Select a unit — {units.length} in stock
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              // Scanners send the value then Enter — auto-select an exact match.
              if (event.key === 'Enter') {
                event.preventDefault()
                const term = search.trim()
                const exact = units.find((unit) => unit.serialNumber === term)
                if (exact) select(exact)
              }
            }}
            placeholder="Search or scan serial / IMEI…"
            className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {units.length === 0 ? 'No units in stock.' : 'No matching unit.'}
            </p>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((unit) => (
                <button
                  key={unit.id}
                  type="button"
                  onClick={() => select(unit)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-primary/50 hover:bg-accent/40',
                  )}
                >
                  <span className="font-mono text-foreground">{unit.serialNumber}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatWarranty(unit.warrantyExpiresAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 flex justify-end border-t border-border pt-3">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
