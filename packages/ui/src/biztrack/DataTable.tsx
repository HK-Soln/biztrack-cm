'use client'

import { clsx } from 'clsx'
import { Fragment, type ReactNode } from 'react'
import { Pagination } from './Pagination'

export interface DataTableColumn<T> {
  /** Stable key for the column (also the default cell accessor). */
  key: string
  header: ReactNode
  align?: 'left' | 'right' | 'center'
  /** Cell renderer. Defaults to `String(row[key])`. */
  render?: (row: T) => ReactNode
  /** Optional control rendered in a filter row beneath the header. */
  filter?: ReactNode
  /** Fixed column width (e.g. 120 or '20%'). */
  width?: string | number
  thClassName?: string
  tdClassName?: string
}

export interface DataTablePaginationProps {
  page: number
  totalPages: number
  total: number
  limit: number
  onPage: (page: number) => void
  prevLabel?: string
  nextLabel?: string
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  /** Click a row (e.g. open detail). Buttons inside cells should stopPropagation. */
  onRowClick?: (row: T) => void
  loading?: boolean
  loadingText?: ReactNode
  empty?: ReactNode
  /** Panel header title (omit to hide the header bar). */
  title?: ReactNode
  /** Chip shown at the right of the panel header (e.g. "248 items"). */
  countLabel?: ReactNode
  /** Search/filter row rendered above the panel. */
  toolbar?: ReactNode
  pagination?: DataTablePaginationProps
  /** When true and provided, render cards instead of the table (mobile/tablet). */
  mobile?: boolean
  renderMobileCard?: (row: T) => ReactNode
  className?: string
}

const alignClass = (a?: 'left' | 'right' | 'center') => (a === 'right' ? 'right' : a === 'center' ? 'center' : undefined)

/**
 * Shared data table for every list page: design `.ltbl` rows, an optional panel
 * header (title + count chip), an optional toolbar slot, optional per-column
 * filter row, loading/empty states, a mobile card fallback and integrated
 * pagination. Pages supply column definitions + row data; all chrome is uniform.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  loadingText,
  empty,
  title,
  countLabel,
  toolbar,
  pagination,
  mobile,
  renderMobileCard,
  className,
}: DataTableProps<T>) {
  const hasFilters = columns.some((c) => c.filter != null)
  const cell = (col: DataTableColumn<T>, row: T): ReactNode =>
    col.render ? col.render(row) : ((row as Record<string, unknown>)[col.key] as ReactNode)

  return (
    <>
      {toolbar ? <div className="toolbar">{toolbar}</div> : null}
      <div className={clsx('panel', className)}>
        {title != null || countLabel != null ? (
          <div className="panel-head">
            {title != null ? <h3>{title}</h3> : null}
            <div className="spacer" style={{ flex: 1 }} />
            {countLabel != null ? <span className="chip-tag">{countLabel}</span> : null}
          </div>
        ) : null}

        {loading ? (
          <div className="cat-empty">{loadingText}</div>
        ) : rows.length === 0 ? (
          <div className="cat-empty">{empty}</div>
        ) : mobile && renderMobileCard ? (
          <div className="u-cards">
            {rows.map((row) => (
              <Fragment key={rowKey(row)}>{renderMobileCard(row)}</Fragment>
            ))}
          </div>
        ) : (
          <table className="ltbl">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className={clsx(alignClass(col.align), col.thClassName)} style={col.width ? { width: col.width } : undefined}>
                    {col.header}
                  </th>
                ))}
              </tr>
              {hasFilters ? (
                <tr className="filter-row">
                  {columns.map((col) => (
                    <th key={col.key} className={clsx(alignClass(col.align), col.thClassName)}>
                      {col.filter ?? null}
                    </th>
                  ))}
                </tr>
              ) : null}
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={onRowClick ? 'clickable' : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={clsx(alignClass(col.align), col.tdClassName)}>
                      {cell(col, row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {pagination ? (
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            limit={pagination.limit}
            onPage={pagination.onPage}
            prevLabel={pagination.prevLabel}
            nextLabel={pagination.nextLabel}
          />
        ) : null}
      </div>
    </>
  )
}
