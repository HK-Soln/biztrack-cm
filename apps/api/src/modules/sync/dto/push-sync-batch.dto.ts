import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { SYNC_BATCH_MAX_OPERATIONS } from '../constants/sync.constants'
enum SyncEntityDto {
  CONTACT = 'contact',
  OPENING_BALANCE = 'opening_balance',
  PRODUCT = 'product',
  PRODUCT_CATEGORY = 'product_category',
  ATTRIBUTE_GROUP = 'attribute_group',
  ATTRIBUTE_OPTION = 'attribute_option',
  CATEGORY_ATTRIBUTE_GROUP = 'category_attribute_group',
  BRAND = 'brand',
  MODEL = 'model',
  BRAND_CATEGORY = 'brand_category',
  PRODUCT_IMAGE = 'product_image',
  PRODUCT_VARIANT = 'product_variant',
  PRODUCT_VARIANT_OPTION = 'product_variant_option',
  EXPENSE_CATEGORY = 'expense_category',
  UNIT_OF_MEASURE = 'unit_of_measure',
  INVENTORY_THRESHOLD = 'inventory_threshold',
  INVENTORY_ADJUSTMENT = 'inventory_adjustment',
  INVENTORY_RESTOCK = 'inventory_restock',
  DEBT = 'debt',
  SALE = 'sale',
  EXPENSE = 'expense',
  SAVINGS = 'savings',
  SAVINGS_TRANSACTION = 'savings_transaction',
}

enum SyncActionDto {
  UPSERT = 'UPSERT',
  DELETE = 'DELETE',
}

export class SyncPushOperationDto {
  @ApiProperty()
  @IsUUID()
  operationId!: string

  @ApiProperty({ enum: SyncEntityDto })
  @IsEnum(SyncEntityDto)
  entity!: SyncEntityDto

  @ApiProperty({ enum: SyncActionDto })
  @IsEnum(SyncActionDto)
  action!: SyncActionDto

  @ApiProperty()
  @IsString()
  recordId!: string

  @ApiProperty()
  @IsISO8601()
  updatedAt!: string

  @ApiPropertyOptional({ type: 'object', nullable: true, additionalProperties: true })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown> | null
}

export class PushSyncBatchDto {
  @ApiProperty()
  @IsString()
  deviceId!: string

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601()
  baseCursor!: string | null

  @ApiProperty({ type: [SyncPushOperationDto] })
  @IsArray()
  @ArrayMaxSize(SYNC_BATCH_MAX_OPERATIONS)
  @ValidateNested({ each: true })
  @Type(() => SyncPushOperationDto)
  operations!: SyncPushOperationDto[]
}
