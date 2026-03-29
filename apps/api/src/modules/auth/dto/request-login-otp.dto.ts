import { ApiProperty } from '@nestjs/swagger'
import { Matches } from 'class-validator'

export class RequestLoginOtpDto {
  @ApiProperty({ example: '+237612345678' })
  @Matches(/^(\+237)?6[5-9]\d{7}$/, { message: 'Invalid Cameroonian phone number' })
  phone!: string
}
