import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator'
import { DocumentRecipientDto } from '@/modules/documents/dto/document-recipient.dto'

const CHANNELS = ['email', 'whatsapp'] as const

/** Dispatch a sale's receipt (rendered from the shared template) to the customer. */
export class SendSaleReceiptDto {
  @ApiProperty({ enum: CHANNELS, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(CHANNELS, { each: true })
  channels!: Array<(typeof CHANNELS)[number]>

  @ApiPropertyOptional({ description: 'Locale for the receipt strings/formatting (e.g. fr, en).' })
  @IsOptional()
  @IsString()
  locale?: string

  @ApiPropertyOptional({ type: DocumentRecipientDto, description: "Override the customer's email/phone." })
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentRecipientDto)
  recipient?: DocumentRecipientDto
}
