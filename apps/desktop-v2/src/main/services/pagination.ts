import type { DatabaseService } from '@biztrack/electron-core'
import type { ListQuery, PaginatedResult } from '../../shared/ipc'

export const DEFAULT_PAGE_LIMIT = 20
export const MAX_PAGE_LIMIT = 100

export interface PaginateOptions {
  /** FROM clause body — a table name or a join expression. */
  from: string
  /** SELECT column list for the data query. */
  columns: string
  /** WHERE body WITHOUT the leading 'WHERE' and WITHOUT the search clause. */
  where: string
  /** Bound params for `where`. */
  params: unknown[]
  /** Columns OR-matched (LIKE) against query.search. */
  searchColumns?: string[]
  /** Default ORDER BY body (without 'ORDER BY'). */
  defaultSort: string
  /** Whitelist of allowed sortBy values → safe column expressions. */
  sortMap?: Record<string, string>
}

function clampLimit(limit: number | undefined): number {
  if (!limit || limit < 1) return DEFAULT_PAGE_LIMIT
  return Math.min(limit, MAX_PAGE_LIMIT)
}

/**
 * Run a paginated SELECT against local SQLite: applies an optional search (OR-LIKE
 * over `searchColumns`), a whitelisted sort, and LIMIT/OFFSET, plus a matching
 * COUNT(*). Returns the page rows + pagination metadata (shape mirrors the API's
 * PaginatedResult so both sides match). Callers map rows → their Local type.
 */
export function paginateRows<Row>(
  db: DatabaseService,
  opts: PaginateOptions,
  query: ListQuery = {},
): { rows: Row[]; total: number; page: number; limit: number; totalPages: number } {
  const page = Math.max(query.page ?? 1, 1)
  const limit = clampLimit(query.limit)
  const offset = (page - 1) * limit

  const params = [...opts.params]
  let where = opts.where
  const search = query.search?.trim()
  if (search && opts.searchColumns?.length) {
    const clause = opts.searchColumns.map((c) => `${c} LIKE ?`).join(' OR ')
    where += ` AND (${clause})`
    for (const _ of opts.searchColumns) params.push(`%${search}%`)
  }

  const sortColumn =
    (query.sortBy && opts.sortMap?.[query.sortBy]) || opts.defaultSort.split(',')[0]?.trim().split(' ')[0]
  const sortDir = query.sortOrder === 'DESC' ? 'DESC' : 'ASC'
  const orderBy = query.sortBy && opts.sortMap?.[query.sortBy] ? `${sortColumn} ${sortDir}` : opts.defaultSort

  const totalRow = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${opts.from} WHERE ${where}`, params)
  const total = totalRow?.n ?? 0

  const rows = db.query<Row>(
    `SELECT ${opts.columns} FROM ${opts.from} WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  )

  return { rows, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }
}

/** Wrap mapped page data with the pagination metadata. */
export function toPaginated<T>(
  data: T[],
  meta: { total: number; page: number; limit: number; totalPages: number },
): PaginatedResult<T> {
  return { data, total: meta.total, page: meta.page, limit: meta.limit, totalPages: meta.totalPages }
}
