import { Transform } from 'class-transformer'
import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator'

export class CreateContactDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 200)
  @Transform(({ value }) => value?.trim())
  name!: string

  @IsString()
  @IsNotEmpty()
  @Length(5, 50)
  @Transform(({ value }) => value?.trim())
  phone!: string

  @IsString()
  @IsNotEmpty()
  @Length(2, 5000)
  @Transform(({ value }) => value?.trim())
  message!: string

  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => (value ? value.trim().toLowerCase() : undefined))
  email?: string

  @IsOptional()
  @IsString()
  @Length(0, 200)
  @Transform(({ value }) => value?.trim())
  business?: string

  @IsOptional()
  @IsString()
  @Length(0, 120)
  @Transform(({ value }) => value?.trim())
  city?: string

  @IsOptional()
  @IsString()
  @Length(0, 120)
  @Transform(({ value }) => value?.trim())
  topic?: string

  @IsOptional()
  @IsBoolean()
  consent?: boolean

  @IsOptional()
  @IsIn(['fr', 'en'])
  locale?: string
}
