import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ArrayMinSize, IsArray, IsIn, IsOptional, IsUUID } from 'class-validator'
import type { RfqSendChannel, SendRfqRequest } from '@biztrack/types'

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
}
