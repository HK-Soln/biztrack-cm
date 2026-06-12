import { ApiProperty } from '@nestjs/swagger'
import { ArrayMaxSize, IsArray, IsHexColor, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import type { AddRolePermissionRequest, SetRolePermissionsRequest, UpdateRoleRequest } from '@biztrack/types'

export class UpdateRoleDto implements UpdateRoleRequest {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string

  @ApiProperty({ required: false, example: '#1D9E75' })
  @IsOptional()
  @IsHexColor()
  colour?: string
}

export class SetRolePermissionsDto implements SetRolePermissionsRequest {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  permissions!: string[]
}

export class AddRolePermissionDto implements AddRolePermissionRequest {
  @ApiProperty({ example: 'sales:create' })
  @IsString()
  @MaxLength(100)
  permission!: string
}
