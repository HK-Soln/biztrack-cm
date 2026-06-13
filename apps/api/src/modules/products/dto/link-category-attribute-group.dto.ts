import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator'
import type {
  LinkCategoryAttributeGroupRequest,
  UpdateCategoryAttributeGroupRequest,
} from '@biztrack/types'

export class LinkCategoryAttributeGroupDto implements LinkCategoryAttributeGroupRequest {
  @ApiProperty()
  @IsUUID()
  attributeGroupId!: string

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  sortOrder?: number
}

export class UpdateCategoryAttributeGroupDto implements UpdateCategoryAttributeGroupRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  sortOrder?: number
}
