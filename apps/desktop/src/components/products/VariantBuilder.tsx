'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CategoryAttributeGroupNode,
  ProductAttributeSelection,
  VariantOverride,
} from '@biztrack/types'
import { AttributeDisplayType } from '@biztrack/types'
import { cn } from '@/lib/utils'

export interface VariantBuilderValue {
  attributeSelections: ProductAttributeSelection[]
  variantOverrides: VariantOverride[]
  /** Number of variants that will be created (after exclusions). */
  variantCount: number
}

type OptionNode = CategoryAttributeGroupNode['options'][number]

interface OverrideDraft {
  excluded?: boolean
  priceOverride?: string
  openingStock?: string
}

const comboKey = (ids: string[]) => [...ids].sort().join('|')

function cartesian(lists: OptionNode[][]): OptionNode[][] {
  return lists.reduce<OptionNode[][]>(
    (acc, list) => acc.flatMap((prefix) => list.map((item) => [...prefix, item])),
    [[]],
  )
}

const cellInputClass =
  'h-9 w-28 rounded-lg border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50'

/**
 * Attribute-driven variant builder for the product-creation form (Phase 3C).
 * Owner selects options per attribute group; the Cartesian product is previewed
 * as a matrix where each combination can be excluded or have its price / opening
 * stock overridden. Emits the attributeSelections + variantOverrides the API
 * consumes. Variant management is online-only; the matrix is computed locally
 * from the synced attribute mirror for a responsive preview.
 */
export function VariantBuilder({
  groups,
  basePrice,
  onChange,
}: {
  groups: CategoryAttributeGroupNode[]
  basePrice: string
  onChange: (value: VariantBuilderValue) => void
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [overrides, setOverrides] = useState<Record<string, OverrideDraft>>({})

  // Reset when the category (and therefore its groups) changes.
  const groupSignature = groups.map((group) => group.attributeGroupId).join(',')
  const previousSignature = useRef(groupSignature)
  useEffect(() => {
    if (previousSignature.current !== groupSignature) {
      previousSignature.current = groupSignature
      setSelected({})
      setOverrides({})
    }
  }, [groupSignature])

  const dimensions = useMemo(
    () =>
      [...groups]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((group) => ({
          group,
          options: group.options.filter((option) =>
            (selected[group.attributeGroupId] ?? []).includes(option.id),
          ),
        }))
        .filter((dimension) => dimension.options.length > 0),
    [groups, selected],
  )

  const combos = useMemo(() => {
    if (dimensions.length === 0) return []
    return cartesian(dimensions.map((dimension) => dimension.options)).map((combo) => ({
      optionIds: combo.map((option) => option.id),
      name: combo.map((option) => option.value).join(' '),
    }))
  }, [dimensions])

  useEffect(() => {
    const attributeSelections: ProductAttributeSelection[] = dimensions.map((dimension) => ({
      attributeGroupId: dimension.group.attributeGroupId,
      selectedOptionIds: dimension.options.map((option) => option.id),
    }))

    const variantOverrides: VariantOverride[] = []
    let included = 0
    for (const combo of combos) {
      const draft = overrides[comboKey(combo.optionIds)]
      const excluded = draft?.excluded ?? false
      if (!excluded) included += 1
      const price = draft?.priceOverride?.trim()
      const stock = draft?.openingStock?.trim()
      if (excluded || price || stock) {
        variantOverrides.push({
          optionIds: combo.optionIds,
          excluded: excluded || undefined,
          priceOverride: price ? Number(price) : undefined,
          openingStock: stock ? Number(stock) : undefined,
        })
      }
    }

    onChange({ attributeSelections, variantOverrides, variantCount: included })
  }, [combos, dimensions, overrides, onChange])

  const toggleOption = (groupId: string, optionId: string) => {
    setSelected((prev) => {
      const current = prev[groupId] ?? []
      const next = current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId]
      return { ...prev, [groupId]: next }
    })
  }

  const setOverride = (key: string, patch: Partial<OverrideDraft>) => {
    setOverrides((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-background px-4 py-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Variants</h3>
        <p className="text-xs text-muted-foreground">
          Pick the options this product comes in. A variant is created for each combination.
          Variants are managed online and require an internet connection to save.
        </p>
      </div>

      {groups.map((group) => {
        const chosen = selected[group.attributeGroupId] ?? []
        const isSwatches = group.displayType === AttributeDisplayType.SWATCHES
        return (
          <div key={group.attributeGroupId} className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">{group.name}</span>
            {group.options.length === 0 ? (
              <p className="text-xs text-muted-foreground">No options defined for this group.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {group.options.map((option) => {
                  const active = chosen.includes(option.id)
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleOption(group.attributeGroupId, option.id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
                        active
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-card text-muted-foreground hover:border-primary/40',
                      )}
                    >
                      {isSwatches && option.colorHex ? (
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
            )}
          </div>
        )
      })}

      {combos.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Preview — {combos.filter((c) => !overrides[comboKey(c.optionIds)]?.excluded).length} of{' '}
              {combos.length} variants
            </span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Include</th>
                  <th className="px-3 py-2 font-medium">Variant</th>
                  <th className="px-3 py-2 font-medium">Selling price</th>
                  <th className="px-3 py-2 font-medium">Opening stock</th>
                </tr>
              </thead>
              <tbody>
                {combos.map((combo) => {
                  const key = comboKey(combo.optionIds)
                  const draft = overrides[key] ?? {}
                  const excluded = draft.excluded ?? false
                  return (
                    <tr key={key} className="border-t border-border">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={!excluded}
                          onChange={(event) => setOverride(key, { excluded: !event.target.checked })}
                        />
                      </td>
                      <td className={cn('px-3 py-2', excluded && 'text-muted-foreground line-through')}>
                        {combo.name}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder={basePrice || 'Base'}
                          value={draft.priceOverride ?? ''}
                          onChange={(event) => setOverride(key, { priceOverride: event.target.value })}
                          disabled={excluded}
                          className={cellInputClass}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          placeholder="0"
                          value={draft.openingStock ?? ''}
                          onChange={(event) => setOverride(key, { openingStock: event.target.value })}
                          disabled={excluded}
                          className={cellInputClass}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}
