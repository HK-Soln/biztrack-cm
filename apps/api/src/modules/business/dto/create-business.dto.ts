import {
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
  IsEmail,
  IsBoolean,
  IsNumber,
  Min,
  Max,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import type { CreateBusinessRequest } from '@biztrack/types'
import { BusinessType, FiscalRegime } from '@biztrack/types'

export class CreateBusinessDto implements CreateBusinessRequest {
  @ApiProperty({ example: 'Boutique Kamga' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string

  @ApiPropertyOptional({ enum: BusinessType, example: BusinessType.BOUTIQUE })
  @IsOptional()
  @IsEnum(BusinessType)
  type?: BusinessType

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @ApiPropertyOptional({ example: '+237612345678' })
  @IsOptional()
  @IsString()
  phone?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string

  @ApiPropertyOptional({ example: 'Akwa, Douala' })
  @IsOptional()
  @IsString()
  address?: string

  @ApiPropertyOptional({ example: 'Douala' })
  @IsOptional()
  @IsString()
  city?: string

  @ApiPropertyOptional({ example: 'CM', default: 'CM' })
  @IsOptional()
  @IsString()
  country?: string

  @ApiPropertyOptional({ enum: ['XAF', 'USD', 'EUR'], default: 'XAF' })
  @IsOptional()
  @IsString()
  currency?: string

  // --- Fiscal / OHADA (stored, not yet used by tax logic) ---
  @ApiPropertyOptional({ example: 'P012345678901A' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  niu?: string

  @ApiPropertyOptional({ example: 'RC/YAO/2025/B/1234' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  rccm?: string

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  vatRegistered?: boolean

  @ApiPropertyOptional({ example: 19.25 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultVatRate?: number

  @ApiPropertyOptional({ enum: FiscalRegime })
  @IsOptional()
  @IsEnum(FiscalRegime)
  fiscalRegime?: FiscalRegime
}
