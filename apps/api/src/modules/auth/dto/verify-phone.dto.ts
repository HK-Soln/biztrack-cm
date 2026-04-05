import { ApiProperty } from '@nestjs/swagger'
import { Matches, Length, IsOptional, IsString } from 'class-validator'

export class VerifyPhoneDto {
  @ApiProperty({ example: '+237612345678' })
  @Matches(/^\+237[6-9]\d{8}$/, { message: 'Invalid Cameroonian phone number' })
  phone!: string

  @ApiProperty({ example: '123456' })
  @Length(6, 6)
  code!: string

  @ApiProperty({ required: false, description: 'Invite token for staff onboarding' })
  @IsOptional()
  @IsString()
  inviteToken?: string
}
