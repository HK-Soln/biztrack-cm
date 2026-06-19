import { ApiProperty } from '@nestjs/swagger'
import { ArrayMinSize, IsArray, IsIn } from 'class-validator'
import type { PurchaseOrderSendChannel, SendPurchaseOrderRequest } from '@biztrack/types'

const CHANNELS: PurchaseOrderSendChannel[] = ['email', 'whatsapp']

export class SendPurchaseOrderDto implements SendPurchaseOrderRequest {
  @ApiProperty({ enum: CHANNELS, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(CHANNELS, { each: true })
  channels!: PurchaseOrderSendChannel[]
}
