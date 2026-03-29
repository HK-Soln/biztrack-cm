import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, Length } from 'class-validator'

export class VerifyEmailDto {
  @ApiProperty({ example: 'jean@example.com' })
  @IsEmail()
  email!: string

  @ApiProperty({ example: '123456' })
  @Length(4, 8)
  code!: string
}
