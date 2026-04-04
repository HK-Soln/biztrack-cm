import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString } from 'class-validator'
import { PrefferedPhoneChannel } from '@biztrack/types'
import { Transform } from 'class-transformer'

export enum OtpType {
  VERIFY_PHONE = 'VERIFY_PHONE',
  VERIFY_EMAIL = 'VERIFY_EMAIL',
  LOGIN = 'LOGIN',
}

export class ResendOtpDto {
  @ApiProperty({ example: '+237612345678 OR jean@example.com' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  identifier!: string

  @ApiProperty({ enum: OtpType })
  @IsEnum(OtpType)
  type!: OtpType

  @ApiProperty({ enum: PrefferedPhoneChannel, required: false })
  @IsOptional()
  @IsEnum(PrefferedPhoneChannel)
  channel?: PrefferedPhoneChannel
}
