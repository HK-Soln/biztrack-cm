import { Type } from 'class-transformer'
import { ArrayNotEmpty, IsArray, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator'
import { RolePermissionDto } from './role-permission.dto'

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RolePermissionDto)
  permissions!: RolePermissionDto[]
}
