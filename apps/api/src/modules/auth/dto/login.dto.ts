import { IsEmail, IsOptional, IsString, MinLength, Matches } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class LoginDto {
  @ApiPropertyOptional({ example: '+237612345678' })
  @IsOptional()
  @Matches(/^(\+237)?6[5-9]\d{7}$/, { message: 'Invalid Cameroonian phone number' })
  phone?: string

  @ApiPropertyOptional({ example: 'jean@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(1)
  password!: string
}
