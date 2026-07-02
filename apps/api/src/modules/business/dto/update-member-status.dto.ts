import { ApiProperty } from '@nestjs/swagger'
import { IsBoolean } from 'class-validator'
import type { UpdateMemberStatusRequest } from '@biztrack/types'

export class UpdateMemberStatusDto implements UpdateMemberStatusRequest {
  @ApiProperty({ description: 'true → reactivate (ACTIVE); false → deactivate/suspend.' })
  @IsBoolean()
  active!: boolean
}
