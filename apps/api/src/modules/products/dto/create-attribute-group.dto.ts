import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import {
  AttributeDisplayType,
  type CreateAttributeGroupRequest,
  type UpdateAttributeGroupRequest,
} from '@biztrack/types'

export class CreateAttributeGroupDto implements CreateAttributeGroupRequest {
  @ApiProperty({ example: 'Color' })
  @IsString()
  @MaxLength(100)
  name!: string

  @ApiProperty({ enum: AttributeDisplayType, example: AttributeDisplayType.CHIPS })
  @IsEnum(AttributeDisplayType)
  displayType!: AttributeDisplayType

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  sortOrder?: number
}

export class UpdateAttributeGroupDto
  extends PartialType(CreateAttributeGroupDto)
  implements UpdateAttributeGroupRequest
{
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
