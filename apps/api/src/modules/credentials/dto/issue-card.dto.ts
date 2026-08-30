import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'
import type { IssueCardRequest } from '@biztrack/types'

export class IssueCardDto implements IssueCardRequest {
  @ApiProperty({ description: 'The member the card authorizes.' })
  @IsUUID()
  memberId!: string

  @ApiPropertyOptional({ maxLength: 60, description: 'Owner-facing label, e.g. "Sam\'s card".' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string | null
}
