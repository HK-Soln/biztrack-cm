import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator'
import {
  ReviewFlagCode,
  ReviewFlagSeverity,
  ReviewFlagStatus,
  type ResolveReviewFlagRequest,
  type ReviewFlagsQuery,
} from '@biztrack/types'

export class QueryReviewFlagsDto implements ReviewFlagsQuery {
  @ApiPropertyOptional({ enum: ReviewFlagStatus })
  @IsOptional()
  @IsEnum(ReviewFlagStatus)
  status?: ReviewFlagStatus

  @ApiPropertyOptional({ enum: ReviewFlagSeverity })
  @IsOptional()
  @IsEnum(ReviewFlagSeverity)
  severity?: ReviewFlagSeverity

  @ApiPropertyOptional({ enum: ReviewFlagCode })
  @IsOptional()
  @IsEnum(ReviewFlagCode)
  code?: ReviewFlagCode

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  entityId?: string

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
  @Max(200)
  limit?: number
}

export class ResolveReviewFlagDto implements ResolveReviewFlagRequest {
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string
}
