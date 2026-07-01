import { Type } from 'class-transformer'
import { IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator'

export class PermissionScopeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  plan?: string
}

export class RolePermissionDto {
  @IsString()
  permission!: string

  @IsOptional()
  @ValidateNested()
  @Type(() => PermissionScopeDto)
  scope?: PermissionScopeDto
}
