import { ApiProperty } from '@nestjs/swagger'
import { Matches, Length } from 'class-validator'

export class VerifyPhoneDto {
  @ApiProperty({ example: '+237612345678' })
  @Matches(/^(\+237)?6[5-9]\d{7}$/, { message: 'Invalid Cameroonian phone number' })
  phone!: string

  @ApiProperty({ example: '123456' })
  @Length(4, 8)
  code!: string
}
