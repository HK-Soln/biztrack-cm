import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator'
import { Type } from 'class-transformer'
import { CashSessionStatus } from '@biztrack/types'

export class OpenCashSessionDto {
  @ApiPropertyOptional({ description: 'Client-generated UUID (device-first idempotency).' })
  @IsOptional()
  @IsUUID()
  id?: string

  @ApiPropertyOptional({ description: 'Opening float in whole XAF.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  openingFloat?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceId?: string
}

export class TransitionCashSessionDto {
  @ApiPropertyOptional({ enum: CashSessionStatus })
  @IsEnum(CashSessionStatus)
  status!: CashSessionStatus

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  closingNote?: string
}

export class ListCashSessionsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number

  @ApiPropertyOptional({ enum: CashSessionStatus })
  @IsOptional()
  @IsEnum(CashSessionStatus)
  status?: CashSessionStatus
}
