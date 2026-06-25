import type { FindOptionsOrder } from 'typeorm'

export interface PaginationOptions<T> {
  page?: number
  limit?: number
  order?: FindOptionsOrder<T>
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}
