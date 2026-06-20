import { ApiProperty } from '@nestjs/swagger'
import { ContactType, IdDocumentType, type CreateContactRequest } from '@biztrack/types'
import { ArrayMaxSize, IsArray, IsEmail, IsEnum, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

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

  @ApiProperty({ required: false, example: 'supplier@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string

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

  @ApiProperty({ required: false, enum: IdDocumentType })
  @IsOptional()
  @IsEnum(IdDocumentType)
  idType?: IdDocumentType | null

  @ApiProperty({ required: false, example: '1234567890' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idNumber?: string | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsISO8601()
  idIssueDate?: string | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsISO8601()
  idExpiryDate?: string | null

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  idDocuments?: string[] | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  selfieUrl?: string | null
}
