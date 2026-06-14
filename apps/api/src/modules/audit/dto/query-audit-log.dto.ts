import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator'
import type { AuditAction, QueryAuditLogRequest } from '@biztrack/types'

const AUDIT_ACTIONS: AuditAction[] = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'HARD_DELETE',
  'RESTORE',
  'VOID',
  'EXPORT',
  'LOGIN',
  'LOGOUT',
  'FAILED_LOGIN',
  'PLAN_CHANGE',
  'PERMISSION_CHANGE',
]

export class QueryAuditLogDto implements QueryAuditLogRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityType?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  entityId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  actorId?: string

  @ApiPropertyOptional({ enum: AUDIT_ACTIONS })
  @IsOptional()
  @IsIn(AUDIT_ACTIONS)
  action?: AuditAction

  @ApiPropertyOptional({ description: 'ISO date — inclusive lower bound.' })
  @IsOptional()
  @IsString()
  from?: string

  @ApiPropertyOptional({ description: 'ISO date — inclusive upper bound.' })
  @IsOptional()
  @IsString()
  to?: string

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number
}
