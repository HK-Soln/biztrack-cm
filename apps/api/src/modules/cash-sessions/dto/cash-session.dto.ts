import { ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import {
  CashMovementKind,
  CashSessionStatus,
  CashVarianceReason,
  type CashVarianceHistoryQuery,
} from '@biztrack/types'

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

export class RecordCashMovementDto {
  @ApiPropertyOptional({ description: 'Client-generated UUID (device-first idempotency).' })
  @IsOptional()
  @IsUUID()
  id?: string

  @ApiPropertyOptional({ enum: CashMovementKind })
  @IsEnum(CashMovementKind)
  kind!: CashMovementKind

  @ApiPropertyOptional({ description: 'Positive whole XAF.' })
  @IsInt()
  @Min(1)
  amount!: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceType?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  referenceId?: string
}

export class CashCountEntryDto {
  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  denomination!: number

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  quantity!: number
}

export class CloseCashSessionDto {
  @ApiPropertyOptional({ type: [CashCountEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CashCountEntryDto)
  counts!: CashCountEntryDto[]

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  confirmedMtnMomo?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  confirmedOrangeMoney?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  closingNote?: string

  @ApiPropertyOptional()
  @IsOptional()
  recountUsed?: boolean
}

export class SetCashVarianceReasonDto {
  @ApiPropertyOptional({ enum: CashVarianceReason })
  @IsEnum(CashVarianceReason)
  reason!: CashVarianceReason

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string
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

export class VarianceHistoryQueryDto implements CashVarianceHistoryQuery {
  @ApiPropertyOptional({ default: 30, description: 'Look-back window in days (1–365).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number
}
