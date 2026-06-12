import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

// decimal(12,2) money / decimal(12,3) quantity column ceilings.
const MAX_MONEY = 9_999_999_999
const MAX_QUANTITY = 9_999_999
import { PaymentMethod, type CreateSaleItemRequest, type CreateSalePaymentRequest, type CreateSaleRequest } from '@biztrack/types'

const CREATE_SALE_PAYMENT_METHODS = [
  PaymentMethod.CASH,
  PaymentMethod.MTN_MOMO,
  PaymentMethod.ORANGE_MONEY,
  PaymentMethod.CARD,
] as const

export class CreateSalePaymentDto implements CreateSalePaymentRequest {
  @ApiProperty({ enum: CREATE_SALE_PAYMENT_METHODS })
  @IsIn(CREATE_SALE_PAYMENT_METHODS)
  method!: PaymentMethod

  @ApiProperty({ example: 5000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(MAX_MONEY)
  amount!: number

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mobileMoneyReference?: string
}

export class CreateSaleItemDto implements CreateSaleItemRequest {
  @ApiProperty()
  @IsUUID()
  productId!: string

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(MAX_QUANTITY)
  quantity!: number

  @ApiProperty({ example: 500 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY)
  unitPrice!: number

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY)
  discountAmount?: number

  @ApiPropertyOptional({ example: 250 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY)
  costPrice?: number
}

export class CreateSaleDto implements CreateSaleRequest {
  @ApiProperty()
  @IsUUID()
  clientId!: string

  @ApiProperty({ example: '2026-04-23T13:45:00.000Z' })
  @IsDateString()
  soldAt!: string

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsUUID()
  customerId?: string

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerName?: string

  @ApiPropertyOptional({ maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerPhone?: string

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY)
  discountAmount?: number

  @ApiPropertyOptional({ example: 250 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY)
  chargesAmount?: number

  @ApiProperty({ type: [CreateSalePaymentDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateSalePaymentDto)
  payments!: CreateSalePaymentDto[]

  @ApiProperty({ type: [CreateSaleItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[]
}
