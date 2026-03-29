import { IsEmail, IsString, MinLength, MaxLength, IsOptional, Matches, IsEnum } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { PrefferedPhoneChannel } from '@biztrack/types'

export class RegisterDto {
  @ApiProperty({ example: 'Jean Dupont' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string

  @ApiProperty({ example: '+237612345678' })
  @Matches(/^(\+237)?6[5-9]\d{7}$/, { message: 'Invalid Cameroonian phone number' })
  phone!: string

  @ApiPropertyOptional({ example: 'jean@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string

  @ApiPropertyOptional({ example: 'password123' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'Password must include lowercase, uppercase, number, and special character',
  })
  password?: string

  @ApiPropertyOptional({ enum: ['fr', 'en'], default: 'fr' })
  @IsOptional()
  @IsString()
  language?: string

  @ApiPropertyOptional({ enum: PrefferedPhoneChannel, default: PrefferedPhoneChannel.WHATSAPP })
  @IsOptional()
  @IsEnum(PrefferedPhoneChannel)
  preferredPhoneChannel?: PrefferedPhoneChannel
}
