import { ApiProperty } from '@nestjs/swagger'
import { ContactType, type CreateContactRequest } from '@biztrack/types'
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class CreateContactDto implements CreateContactRequest {
  @ApiProperty({ enum: ContactType, example: ContactType.CUSTOMER })
  @IsEnum(ContactType)
  type!: ContactType

  @ApiProperty({ example: 'Marie Ekotto' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string

  @ApiProperty({ example: '+237699000111' })
  @IsString()
  @MinLength(5)
  @MaxLength(30)
  phone!: string

  @ApiProperty({ required: false, example: '+237677000111' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phoneAlt?: string

  @ApiProperty({ required: false, example: 'Akwa, Douala' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string
}
