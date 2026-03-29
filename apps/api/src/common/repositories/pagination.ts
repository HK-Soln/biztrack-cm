import type { FindOptionsOrder, FindOptionsWhere } from 'typeorm'

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

export interface PaginateArgs<T> {
  where?: FindOptionsWhere<T>
  options?: PaginationOptions<T>
}
