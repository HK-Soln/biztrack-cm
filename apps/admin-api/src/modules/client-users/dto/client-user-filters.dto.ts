import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

export class ClientUserFiltersDto {
  @IsOptional()
  @IsString()
  search?: string // name, phone, or email

  @IsOptional()
  @IsString()
  status?: string // PENDING | PHONE_VERIFIED | ACTIVE

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}
