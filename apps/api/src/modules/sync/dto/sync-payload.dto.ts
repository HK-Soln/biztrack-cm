import { IsString, IsOptional, IsArray, IsUUID, IsBoolean, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

class SyncRecordDto {
  @ApiProperty()
  @IsUUID()
  id!: string

  @ApiProperty()
  @IsString()
  updatedAt!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDeleted?: boolean
}

class ChangesDto {
  @ApiPropertyOptional({ type: [SyncRecordDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncRecordDto)
  products?: SyncRecordDto[]

  @ApiPropertyOptional({ type: [SyncRecordDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncRecordDto)
  productCategories?: SyncRecordDto[]
}

export class SyncPayloadDto {
  @ApiProperty()
  @IsString()
  deviceId!: string

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  lastSyncedAt!: string | null

  @ApiProperty()
  @ValidateNested()
  @Type(() => ChangesDto)
  changes!: ChangesDto
}
