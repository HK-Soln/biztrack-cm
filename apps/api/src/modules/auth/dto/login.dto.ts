import { IsString, MinLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'

export class LoginDto {
  @ApiProperty({ example: '+237612345678 OR jean@example.com' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  identifier!: string

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(1)
  password!: string
}
