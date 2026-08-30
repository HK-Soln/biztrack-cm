import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength } from 'class-validator'
import type { ReplaceCardRequest } from '@biztrack/types'

/** Replace (rotate) a card. The member is taken from the card in the URL; only a new label may be
 * supplied. Blank keeps the label of the card being replaced (BIZ-3.3). */
export class ReplaceCardDto implements ReplaceCardRequest {
  @ApiPropertyOptional({
    maxLength: 60,
    description: 'New owner-facing label; blank keeps the old.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string | null
}
