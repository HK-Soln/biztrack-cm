import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength, MinLength } from 'class-validator'
import type { RetireSerialUnitRequest } from '@biztrack/types'

/** Retire a unit from stock (a stock-out). The reason is recorded on the
 * resulting movement and the audit trail. */
export class RetireSerialUnitDto implements RetireSerialUnitRequest {
  @ApiProperty({ example: 'Damaged in transit', description: 'Why the unit is leaving stock.' })
  @IsString()
  @MinLength(3)
  @MaxLength(280)
  reason!: string
}
