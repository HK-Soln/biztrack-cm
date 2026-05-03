import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsOptional, Matches } from 'class-validator'
import type { ExpenseRangeGroupBy } from '@biztrack/types'

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

enum ExpenseRangeGroupByDto {
  MONTH = 'MONTH',
  CATEGORY = 'CATEGORY',
}

export class RangeExpenseSummaryQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01' })
  @Matches(DATE_ONLY_REGEX)
  dateFrom!: string

  @ApiPropertyOptional({ example: '2026-04-30' })
  @Matches(DATE_ONLY_REGEX)
  dateTo!: string

  @ApiPropertyOptional({ enum: ExpenseRangeGroupByDto, default: ExpenseRangeGroupByDto.MONTH })
  @IsOptional()
  @IsEnum(ExpenseRangeGroupByDto)
  groupBy?: ExpenseRangeGroupBy
}
