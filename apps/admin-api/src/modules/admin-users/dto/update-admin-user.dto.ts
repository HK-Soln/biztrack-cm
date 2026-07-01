import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator'

export class UpdateAdminUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string

  @IsOptional()
  @IsUUID()
  adminRoleId?: string
}
