import { Type } from 'class-transformer'
import { IsArray, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator'
import { RolePermissionDto } from './role-permission.dto'

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  // When provided, fully replaces the role's permission set.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RolePermissionDto)
  permissions?: RolePermissionDto[]
}
