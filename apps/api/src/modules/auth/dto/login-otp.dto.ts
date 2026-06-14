import { ApiProperty } from '@nestjs/swagger'
import { Length, IsString } from 'class-validator'
import { Transform } from 'class-transformer'
import type { LoginOtpRequest } from '@biztrack/types'
import { IsIdentifier } from '@/common/validators/is-identifier.validator'

export class LoginOtpDto implements LoginOtpRequest {
  @ApiProperty({ example: '+237612345678 OR jean@example.com' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsIdentifier()
  identifier!: string

  @ApiProperty({ example: '123456' })
  @Length(6, 6)
  code!: string
}
