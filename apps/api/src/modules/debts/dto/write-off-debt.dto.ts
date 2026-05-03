import { ApiProperty } from '@nestjs/swagger'
import type { WriteOffDebtRequest } from '@biztrack/types'
import { IsString, MaxLength, MinLength } from 'class-validator'

export class WriteOffDebtDto implements WriteOffDebtRequest {
  @ApiProperty({ example: 'Customer relocated and balance is unrecoverable.' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string
}
