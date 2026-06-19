import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator'
import type { RecordRfqQuoteRequest } from '@biztrack/types'

export class RecordRfqQuoteDto implements RecordRfqQuoteRequest {
  @ApiProperty()
  @IsUUID()
  rfqSupplierId!: string

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  quotedTotal!: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  quoteNotes?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  quoteFileUrl?: string | null
}
