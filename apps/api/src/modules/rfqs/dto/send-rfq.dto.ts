import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMinSize, IsArray, IsIn, IsOptional, IsUUID, ValidateNested } from 'class-validator'
import type { RfqSendChannel, SendRfqRequest } from '@biztrack/types'
import { DocumentRecipientDto } from '@/modules/documents/dto/document-recipient.dto'

const CHANNELS: RfqSendChannel[] = ['email', 'whatsapp']

export class SendRfqDto implements SendRfqRequest {
  @ApiProperty({ enum: CHANNELS, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(CHANNELS, { each: true })
  channels!: RfqSendChannel[]

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  supplierIds?: string[]

  @ApiPropertyOptional({ type: DocumentRecipientDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentRecipientDto)
  recipient?: DocumentRecipientDto
}
