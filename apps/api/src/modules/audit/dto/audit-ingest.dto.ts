import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

/** Max audit rows accepted per ingest call (BIZ-2.10) — the desktop drains in batches. */
export const AUDIT_INGEST_MAX_ROWS = 500

/** One local_audit_logs row pushed up from a device (BIZ-2.10). */
export class AuditIngestRowDto {
  @IsString()
  id!: string

  @IsString()
  action!: string

  @IsString()
  entityType!: string

  @IsString()
  entityId!: string

  @IsOptional()
  @IsString()
  entityLabel?: string | null

  @IsOptional()
  @IsString()
  actorId?: string | null

  @IsOptional()
  @IsString()
  actorName?: string | null

  @IsOptional()
  @IsString()
  actorRole?: string | null

  @IsOptional()
  @IsObject()
  changes?: Record<string, unknown> | null

  @IsOptional()
  @IsInt()
  amount?: number | null

  @IsOptional()
  @IsInt()
  sequence?: number | null

  @IsOptional()
  @IsString()
  cashSessionId?: string | null

  @IsISO8601()
  createdAt!: string

  @IsOptional()
  @IsISO8601()
  deviceTime?: string | null
}

export class AuditIngestDto {
  @IsString()
  deviceId!: string

  @IsArray()
  @ArrayMaxSize(AUDIT_INGEST_MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => AuditIngestRowDto)
  rows!: AuditIngestRowDto[]
}
