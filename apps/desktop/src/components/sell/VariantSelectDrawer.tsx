'use client'

import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@biztrack/ui'
import { cn } from '@/lib/utils'
import type { ProductVariantSelection, SellVariant } from '@/services/products.local'

interface VariantSelectDrawerProps {
  open: boolean
  productName: string
  basePrice: number
  selection: ProductVariantSelection
  loading?: boolean
  onClose: () => void
  onSelect: (variant: SellVariant) => void
}

const formatPrice = (value: number) => `${Math.round(value).toLocaleString('fr-FR')} XAF`

/**
 * Sell-screen variant selector (Phase 3D). Renders one selector per attribute
 * group; options with no in-stock combination (given the current selection) are
 * greyed out. Once every group has a value the matching variant resolves and can
 * be added to the cart.
 */
export function VariantSelectDrawer({
  open,
  productName,
  basePrice,
  selection,
  loading = false,
  onClose,
  onSelect,
}: VariantSelectDrawerProps) {
  const [selected, setSelected] = useState<Record<string, string>>({})

  const { groups, variants } = selection

  // groupId -> set of optionIds that have an in-stock variant given the others.
  const availableOptions = useMemo(() => {
    const result = new Map<string, Set<string>>()
    for (const group of groups) {
      const set = new Set<string>()
      for (const option of group.options) {
        const hasStock = variants.some((variant) => {
          if (variant.optionsByGroup[group.id] !== option.id) return false
          for (const [groupId, optionId] of Object.entries(selected)) {
            if (groupId === group.id) continue
            if (variant.optionsByGroup[groupId] !== optionId) return false
          }
          return variant.currentStock > 0
        })
        if (hasStock) set.add(option.id)
      }
      result.set(group.id, set)
    }
    return result
  }, [groups, variants, selected])

  const resolvedVariant = useMemo(() => {
    if (groups.length === 0) return null
    if (!groups.every((group) => selected[group.id])) return null
    return (
      variants.find((variant) =>
        groups.every((group) => variant.optionsByGroup[group.id] === selected[group.id]),
      ) ?? null
    )
  }, [groups, variants, selected])

  if (!open) return null

  const effectivePrice = resolvedVariant
    ? (resolvedVariant.priceOverride ?? basePrice)
    : basePrice
  const canAdd = Boolean(resolvedVariant && resolvedVariant.currentStock > 0)

  const toggle = (groupId: string, optionId: string) => {
    setSelected((prev) => ({ ...prev, [groupId]: prev[groupId] === optionId ? '' : optionId }))
  }

  const handleClose = () => {
    setSelected({})
    onClose()
  }

  const handleAdd = () => {
    if (!resolvedVariant || !canAdd) return
    onSelect(resolvedVariant)
    setSelected({})
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative w-full max-w-lg rounded-t-2xl border border-border bg-card p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{productName}</h2>
            <p className="text-sm text-muted-foreground">Select a version</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No variants available for this product.
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => {
              const available = availableOptions.get(group.id) ?? new Set<string>()
              return (
                <div key={group.id} className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">{group.name}</span>
                  <div className="flex flex-wrap gap-2">
                    {group.options.map((option) => {
                      const isSelected = selected[group.id] === option.id
                      const isAvailable = available.has(option.id) || isSelected
                      return (
                        <button
                          key={option.id}
                          type="button"
                          disabled={!isAvailable}
                          onClick={() => toggle(group.id, option.id)}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                            isSelected
                              ? 'border-primary bg-primary/10 text-foreground'
                              : 'border-border bg-background text-muted-foreground hover:border-primary/40',
                            !isAvailable && 'cursor-not-allowed opacity-40',
                          )}
                        >
                          {option.colorHex ? (
                            <span
                              className="h-3 w-3 rounded-full border border-border"
                              style={{ backgroundColor: option.colorHex }}
                            />
                          ) : null}
                          {option.value}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            <div className="flex items-center justify-between border-t border-border pt-3">
              <div className="text-sm">
                <div className="font-medium text-foreground">{formatPrice(effectivePrice)}</div>
                <div className="text-xs text-muted-foreground">
                  {resolvedVariant
                    ? resolvedVariant.currentStock > 0
                      ? `${resolvedVariant.currentStock} in stock`
                      : 'Out of stock'
                    : 'Choose all options'}
                </div>
              </div>
              <Button onClick={handleAdd} disabled={!canAdd}>
                Add to cart
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
