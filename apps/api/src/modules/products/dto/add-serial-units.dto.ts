import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { SerialType } from '@biztrack/types'
import type { AddSerialUnitInput, AddSerialUnitsRequest } from '@biztrack/types'

export class AddSerialUnitInputDto implements AddSerialUnitInput {
  @ApiProperty({ example: '356938035643809' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  serialNumber!: string

  @ApiProperty({ enum: SerialType, example: SerialType.IMEI })
  @IsEnum(SerialType)
  serialType!: SerialType

  @ApiPropertyOptional({ description: 'Variant to attach to (required when the product has variants).' })
  @IsOptional()
  @IsUUID()
  variantId?: string | null
}

export class AddSerialUnitsDto implements AddSerialUnitsRequest {
  @ApiProperty({ type: [AddSerialUnitInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AddSerialUnitInputDto)
  units!: AddSerialUnitInputDto[]

  @ApiPropertyOptional({ description: 'Note recorded on the resulting stock-in movement.' })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  notes?: string | null
}
