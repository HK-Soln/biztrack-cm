import { ApiProperty } from '@nestjs/swagger'
import { Length, IsOptional, IsString } from 'class-validator'
import type { VerifyPhoneRequest } from '@biztrack/types'
import { IsValidPhone } from '@/common/validators/is-identifier.validator'

export class VerifyPhoneDto implements VerifyPhoneRequest {
  @ApiProperty({ example: '+237612345678' })
  @IsValidPhone()
  phone!: string

  @ApiProperty({ example: '123456' })
  @Length(6, 6)
  code!: string

  @ApiProperty({ required: false, description: 'Invite token for staff onboarding' })
  @IsOptional()
  @IsString()
  inviteToken?: string
}
