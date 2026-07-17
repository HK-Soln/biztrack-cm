import { Type } from 'class-transformer'
import { IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator'

export class AuditFiltersDto {
  @IsOptional()
  @IsUUID()
  adminUserId?: string

  @IsOptional()
  @IsString()
  action?: string

  @IsOptional()
  @IsString()
  entityType?: string

  @IsOptional()
  @IsISO8601()
  from?: string

  @IsOptional()
  @IsISO8601()
  to?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}
