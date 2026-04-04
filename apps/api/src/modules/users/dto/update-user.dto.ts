import { IsString, IsOptional, MinLength, MaxLength, IsEnum } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Locale } from '@/common/enums/locale.enum'

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string

  @ApiPropertyOptional({ enum: Locale })
  @IsOptional()
  @IsEnum(Locale)
  language?: Locale

  @ApiPropertyOptional({ enum: Locale, description: 'Alias for language' })
  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale
}
