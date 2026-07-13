import { IsBoolean, IsISO8601, IsOptional, IsString, MinLength } from 'class-validator'

export class CreateOverrideDto {
  @IsString()
  resource!: string // must be a valid Resource enum value

  @IsOptional()
  @IsBoolean()
  granted?: boolean // default true (unlock); false = explicit revoke

  @IsString()
  @MinLength(3)
  reason!: string

  @IsOptional()
  @IsISO8601()
  expiresAt?: string // null/absent = permanent
}
