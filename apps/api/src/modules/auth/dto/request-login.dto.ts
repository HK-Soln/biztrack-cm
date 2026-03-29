import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsEmail, IsOptional, Matches } from 'class-validator'

export class RequestLoginDto {
  @ApiPropertyOptional({ example: '+237612345678' })
  @IsOptional()
  @Matches(/^(\+237)?6[5-9]\d{7}$/, { message: 'Invalid Cameroonian phone number' })
  phone?: string

  @ApiPropertyOptional({ example: 'jean@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string
}
