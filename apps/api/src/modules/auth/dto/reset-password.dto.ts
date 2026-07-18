import { ApiProperty } from '@nestjs/swagger'
import { IsString, Length, Matches, MaxLength, MinLength } from 'class-validator'
import { Transform } from 'class-transformer'
import type { ResetPasswordRequest } from '@biztrack/types'
import { IsIdentifier } from '@/common/validators/is-identifier.validator'

export class ResetPasswordDto implements ResetPasswordRequest {
  @ApiProperty({ example: '+237612345678 OR jean@example.com' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsIdentifier()
  identifier!: string

  @ApiProperty({ example: '123456' })
  @Length(6, 6)
  code!: string

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'Password must include lowercase, uppercase, number, and special character',
  })
  newPassword!: string
}
