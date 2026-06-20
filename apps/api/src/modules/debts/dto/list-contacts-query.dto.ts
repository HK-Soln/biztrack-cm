import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsEnum, IsIn, IsOptional } from 'class-validator'
import { ContactType, type ContactsQuery } from '@biztrack/types'
import { ListQueryDto } from '@/common/dto/list-query.dto'

function toBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return value as boolean
}

export class ListContactsQueryDto extends ListQueryDto implements ContactsQuery {
  @ApiPropertyOptional({ enum: ContactType })
  @IsOptional()
  @IsEnum(ContactType)
  type?: ContactType

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  isActive?: boolean

  @ApiPropertyOptional({ enum: ['debtor', 'creditor'] })
  @IsOptional()
  @IsIn(['debtor', 'creditor'])
  balance?: 'debtor' | 'creditor'
}
