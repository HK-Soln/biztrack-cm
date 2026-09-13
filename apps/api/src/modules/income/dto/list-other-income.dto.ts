import { Type } from 'class-transformer'
import { IsInt, IsISO8601, IsOptional, IsUUID, Min } from 'class-validator'
import { type ListOtherIncomeQuery } from '@biztrack/types'

/** Query for GET /income (paginated, newest first). */
export class ListOtherIncomeDto implements ListOtherIncomeQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number

  @IsOptional()
  @IsUUID()
  categoryId?: string

  @IsOptional()
  @IsISO8601()
  from?: string

  @IsOptional()
  @IsISO8601()
  to?: string
}
