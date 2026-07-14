import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString } from 'class-validator'
import { Transform } from 'class-transformer'
import { PrefferedPhoneChannel, type RequestPasswordResetRequest } from '@biztrack/types'
import { IsIdentifier } from '@/common/validators/is-identifier.validator'

export class RequestPasswordResetDto implements RequestPasswordResetRequest {
  @ApiProperty({ example: '+237612345678 OR jean@example.com' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsIdentifier()
  identifier!: string

  @ApiProperty({ enum: PrefferedPhoneChannel, required: false })
  @IsOptional()
  @IsEnum(PrefferedPhoneChannel)
  preferredOtpChannel?: PrefferedPhoneChannel
}
