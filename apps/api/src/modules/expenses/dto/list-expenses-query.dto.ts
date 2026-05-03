import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsOptional, IsUUID, Matches } from 'class-validator'
import type { ExpensesQuery } from '@biztrack/types'
import { ListQueryDto } from '@/common/dto/list-query.dto'

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

function toBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return value as boolean
}

export class ListExpensesQueryDto extends ListQueryDto implements ExpensesQuery {
  @ApiPropertyOptional({ example: '2026-04-01' })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX)
  dateFrom?: string

  @ApiPropertyOptional({ example: '2026-04-30' })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX)
  dateTo?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  isRecurring?: boolean
}
