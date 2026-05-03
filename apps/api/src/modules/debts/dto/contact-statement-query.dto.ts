import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsOptional } from 'class-validator'
import { DebtDirection, type ContactStatementQuery } from '@biztrack/types'

export class ContactStatementQueryDto implements ContactStatementQuery {
  @ApiPropertyOptional({ enum: DebtDirection })
  @IsOptional()
  @IsEnum(DebtDirection)
  direction?: DebtDirection
}
