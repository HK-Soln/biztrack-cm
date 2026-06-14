import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator'
import type { SendInviteRequest } from '@biztrack/types'
import { IsValidPhone } from '@/common/validators/is-identifier.validator'

export class SendInviteDto implements SendInviteRequest {
  @ApiProperty({ example: 'uuid-of-role' })
  @IsUUID()
  roleId!: string

  @ApiProperty({ required: false, example: '+237612345678' })
  @IsOptional()
  @IsValidPhone()
  phone?: string

  @ApiProperty({ required: false, example: 'staff@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string
}
