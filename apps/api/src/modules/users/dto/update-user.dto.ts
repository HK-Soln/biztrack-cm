import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

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

  @ApiPropertyOptional({ enum: ['fr', 'en'] })
  @IsOptional()
  @IsString()
  language?: string
}
