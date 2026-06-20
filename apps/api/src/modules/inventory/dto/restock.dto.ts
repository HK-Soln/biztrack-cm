import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import {
  PaymentMethod,
  type RestockChargeLineRequest,
  type RestockDiscountLineRequest,
  type RestockItemRequest,
  type RestockPaymentRequest,
  type RestockRequest,
} from '@biztrack/types'

const CHARGE_RATE_TYPES = ['PERCENT', 'FIXED'] as const
const DISCOUNT_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT'] as const

const RESTOCK_PAYMENT_METHODS = [
  PaymentMethod.CASH,
  PaymentMethod.MTN_MOMO,
  PaymentMethod.ORANGE_MONEY,
  PaymentMethod.CARD,
] as const

export class RestockItemDto implements RestockItemRequest {
  @ApiProperty()
  @IsUUID()
  productId!: string

  @ApiPropertyOptional({ example: 12, description: 'Omit for serialised products (use serialNumbers).' })
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  quantity?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitCost?: number

  @ApiPropertyOptional({ description: 'Required when restocking a specific variant.' })
  @IsOptional()
  @IsUUID()
  variantId?: string

  @ApiPropertyOptional({
    type: [String],
    description: 'Serial/IMEI numbers received (serialised products only).',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serialNumbers?: string[]

  @ApiPropertyOptional({ description: 'Warranty months for this delivery (overrides product default).' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  warrantyMonths?: number
}

export class RestockPaymentDto implements RestockPaymentRequest {
  @ApiProperty({ enum: RESTOCK_PAYMENT_METHODS })
  @IsIn(RESTOCK_PAYMENT_METHODS)
  method!: PaymentMethod

  @ApiProperty({ example: 5000 })
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount!: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mobileMoneyReference?: string
}

export class RestockChargeDto implements RestockChargeLineRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  chargeTypeId?: string | null

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string

  @ApiProperty({ enum: CHARGE_RATE_TYPES })
  @IsIn(CHARGE_RATE_TYPES)
  rateType!: 'PERCENT' | 'FIXED'

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  rateValue!: number

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount!: number
}

export class RestockDiscountDto implements RestockDiscountLineRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id!: string

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  description!: string

  @ApiProperty({ enum: DISCOUNT_TYPES })
  @IsIn(DISCOUNT_TYPES)
  discountType!: 'PERCENTAGE' | 'FIXED_AMOUNT'

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  rate?: number | null

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount!: number
}

export class RestockDto implements RestockRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierName?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  totalAmount?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  totalCost?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  subtotalAmount?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  discountAmount?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  chargesAmount?: number

  @ApiPropertyOptional({ type: [RestockPaymentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RestockPaymentDto)
  payments?: RestockPaymentDto[]

  @ApiPropertyOptional({ type: [RestockChargeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RestockChargeDto)
  charges?: RestockChargeDto[]

  @ApiPropertyOptional({ type: [RestockDiscountDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RestockDiscountDto)
  discounts?: RestockDiscountDto[]

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  invoiceNumber?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  invoiceDate?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  invoiceFileUrl?: string | null

  @ApiProperty({ type: [RestockItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RestockItemDto)
  items!: RestockItemDto[]
}
