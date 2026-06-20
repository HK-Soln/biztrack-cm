import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMinSize, IsArray, IsIn, IsOptional, ValidateNested } from 'class-validator'
import type { PurchaseOrderSendChannel, SendPurchaseOrderRequest } from '@biztrack/types'
import { DocumentRecipientDto } from '@/modules/documents/dto/document-recipient.dto'

const CHANNELS: PurchaseOrderSendChannel[] = ['email', 'whatsapp']

export class SendPurchaseOrderDto implements SendPurchaseOrderRequest {
  @ApiProperty({ enum: CHANNELS, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(CHANNELS, { each: true })
  channels!: PurchaseOrderSendChannel[]

  @ApiPropertyOptional({ type: DocumentRecipientDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentRecipientDto)
  recipient?: DocumentRecipientDto
}
