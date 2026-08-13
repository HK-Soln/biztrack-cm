import { ApiProperty } from '@nestjs/swagger'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsHexColor,
  IsNumber,
  IsOptional,
  Max,
  MaxLength,
  Min,
  MinLength,
  IsString,
  ValidateIf,
} from 'class-validator'
import type { CreateRoleRequest } from '@biztrack/types'

export class CreateRoleDto implements CreateRoleRequest {
  @ApiProperty({ example: 'Superviseur' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string

  @ApiProperty({ type: [String], example: ['sales:create', 'sales:view_own'] })
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  permissions!: string[]

  @ApiProperty({ required: false, example: '#1D9E75' })
  @IsOptional()
  @IsHexColor()
  colour?: string

  @ApiProperty({ required: false, description: 'May set a PIN and authorize till step-up.' })
  @IsOptional()
  @IsBoolean()
  canAuthorize?: boolean

  @ApiProperty({ required: false, description: 'Max line discount % (null = no limit).' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  maxDiscountPercent?: number | null

  @ApiProperty({ required: false, description: 'Max cart-level discount % (null = no limit).' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  maxCartDiscountPercent?: number | null

  @ApiProperty({ required: false, description: 'Max discount amount in XAF (null = no limit).' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxDiscountAmountXaf?: number | null

  @ApiProperty({ required: false, description: 'May sell below cost without a flag.' })
  @IsOptional()
  @IsBoolean()
  allowBelowCost?: boolean
}
