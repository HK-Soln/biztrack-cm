import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator'
import { DebtStatus, type DebtsQuery } from '@biztrack/types'
import { ListQueryDto } from '@/common/dto/list-query.dto'

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

export class ListDebtsQueryDto extends ListQueryDto implements DebtsQuery {
  @ApiPropertyOptional({ enum: DebtStatus })
  @IsOptional()
  @IsEnum(DebtStatus)
  status?: DebtStatus

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  contactId?: string

  @ApiPropertyOptional({ example: '2026-04-01' })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX)
  dateFrom?: string

  @ApiPropertyOptional({ example: '2026-04-30' })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX)
  dateTo?: string
}
