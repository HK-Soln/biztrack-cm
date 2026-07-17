import { IsIn, IsString, MinLength } from 'class-validator'

export class SetBusinessStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status!: 'ACTIVE' | 'SUSPENDED'

  @IsString()
  @MinLength(3)
  reason!: string
}
