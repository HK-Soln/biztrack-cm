'use client'
import * as React from 'react'

export interface PaginationProps {
  page: number
  totalPages: number
  total: number
  limit: number
  onPage: (page: number) => void
  /** Localized label builder for the "X–Y of N" range. */
  rangeLabel?: (from: number, to: number, total: number) => string
  prevLabel?: string
  nextLabel?: string
}

/**
 * Compact pager for paginated lists: a "from–to of total" range + Prev/Next.
 * Hidden entirely when there's a single page. Pairs with the .pager CSS.
 */
export function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPage,
  rangeLabel,
  prevLabel = 'Previous',
  nextLabel = 'Next',
}: PaginationProps) {
  if (total === 0 || totalPages <= 1) return null
  const from = (page - 1) * limit + 1
  const to = Math.min(page * limit, total)
  const label = rangeLabel ? rangeLabel(from, to, total) : `${from}–${to} of ${total}`

  return (
    <div className="pager">
      <span className="pager-range">{label}</span>
      <div className="pager-btns">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="m10 3-5 5 5 5" />
          </svg>
          {prevLabel}
        </button>
        <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          {nextLabel}
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 3 5 5-5 5" />
          </svg>
        </button>
      </div>
    </div>
  )
}
