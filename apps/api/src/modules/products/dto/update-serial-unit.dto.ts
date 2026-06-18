import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength, MinLength } from 'class-validator'
import type { UpdateSerialUnitRequest } from '@biztrack/types'

/** Correct a unit's serial number. No quantity change → no stock movement. */
export class UpdateSerialUnitDto implements UpdateSerialUnitRequest {
  @ApiProperty({ example: '356938035643809' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  serialNumber!: string
}
