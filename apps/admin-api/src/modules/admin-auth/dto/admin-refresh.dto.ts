import { IsOptional, IsString } from 'class-validator'

export class AdminRefreshDto {
  // Optional in body — may also arrive via httpOnly cookie.
  @IsOptional()
  @IsString()
  refreshToken?: string
}
