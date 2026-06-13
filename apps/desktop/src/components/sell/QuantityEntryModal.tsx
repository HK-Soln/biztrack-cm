'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button, NumberInput } from '@biztrack/ui'

interface QuantityEntryModalProps {
  open: boolean
  productName: string
  unitLabel: string | null
  unitPrice: number
  /** Available stock for tracked products; null = untracked (no cap). */
  stock: number | null
  onClose: () => void
  onConfirm: (quantity: number) => void
}

const formatPrice = (value: number) => `${Math.round(value).toLocaleString('fr-FR')} XAF`

/**
 * Decimal quantity entry for VARIABLE_QUANTITY products (Phase 3E) — e.g. rice by
 * the kilo. Shows the live line total (qty × unit price) as the cashier types.
 */
export function QuantityEntryModal({
  open,
  productName,
  unitLabel,
  unitPrice,
  stock,
  onClose,
  onConfirm,
}: QuantityEntryModalProps) {
  const [value, setValue] = useState('')

  if (!open) return null

  const parsed = Number(value)
  const isValid = Number.isFinite(parsed) && parsed > 0 && (stock === null || parsed <= stock)
  const lineTotal = isValid ? parsed * unitPrice : 0

  const close = () => {
    setValue('')
    onClose()
  }

  const confirm = () => {
    if (!isValid) return
    onConfirm(Number(parsed.toFixed(3)))
    setValue('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={close} />
      <div className="relative w-full max-w-sm rounded-t-2xl border border-border bg-card p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{productName}</h2>
            <p className="text-sm text-muted-foreground">
              Enter quantity{unitLabel ? ` (${unitLabel})` : ''}
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

        <NumberInput
          autoFocus
          value={value}
          min="0"
          step="0.001"
          inputMode="decimal"
          placeholder="0.000"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              confirm()
            }
          }}
        />

        {stock !== null ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {stock.toLocaleString('fr-FR')} {unitLabel ?? ''} in stock
          </p>
        ) : null}

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <div className="text-sm">
            <div className="text-xs text-muted-foreground">
              {isValid ? `${parsed} × ${formatPrice(unitPrice)}` : `${formatPrice(unitPrice)} / ${unitLabel ?? 'unit'}`}
            </div>
            <div className="font-semibold text-foreground">{formatPrice(lineTotal)}</div>
          </div>
          <Button onClick={confirm} disabled={!isValid}>
            Add to cart
          </Button>
        </div>
      </div>
    </div>
  )
}
