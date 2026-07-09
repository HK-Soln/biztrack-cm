import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import type {
  AddCartItemRequest,
  CheckoutRequest,
  OnlineFulfillmentType,
  OnlineOrderStatus,
  OnlinePaymentStatus,
  OrderSerialSelection,
  UpdateCartItemRequest,
  UpdateOrderPaymentRequest,
  UpdateOrderStatusRequest,
} from '@biztrack/types'
import { ONLINE_PAYMENT_METHODS } from '@biztrack/types'

import type { PublicProductsQuery } from '@biztrack/types'

/** Normalise a query param into a clean string[] (accepts `a,b` or repeated params). */
const toIdArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value == null) return undefined
  const parts = (Array.isArray(value) ? value : String(value).split(','))
    .map((v) => String(v).trim())
    .filter(Boolean)
  return parts.length ? parts : undefined
}

export class PublicProductsQueryDto implements PublicProductsQuery {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({ default: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(toIdArray)
  @IsArray()
  @IsUUID('all', { each: true })
  categoryIds?: string[]

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(toIdArray)
  @IsArray()
  @IsUUID('all', { each: true })
  brandIds?: string[]

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(toIdArray)
  @IsArray()
  @IsUUID('all', { each: true })
  modelIds?: string[]

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(toIdArray)
  @IsArray()
  @IsUUID('all', { each: true })
  attributeOptionIds?: string[]

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string
}

const FULFILLMENT_TYPES: OnlineFulfillmentType[] = ['DELIVERY', 'PICKUP']
const ORDER_STATUSES: OnlineOrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'PICKED_UP',
  'READY_FOR_DISPATCH',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELIVERY_FAILED',
  'RETURNED',
  'CANCELLED',
]

export class AddCartItemDto implements AddCartItemRequest {
  @ApiPropertyOptional({ description: 'Existing cart session; a new one is created if omitted.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sessionToken?: string

  @ApiProperty()
  @IsUUID()
  productId!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  variantId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  serialUnitId?: string

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number
}

export class UpdateCartItemDto implements UpdateCartItemRequest {
  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number
}

export class CheckoutDto implements CheckoutRequest {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  customerName!: string

  @ApiProperty()
  @IsString()
  @MaxLength(30)
  customerPhone!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  customerEmail?: string

  @ApiPropertyOptional({ enum: FULFILLMENT_TYPES })
  @IsOptional()
  @IsIn(FULFILLMENT_TYPES)
  fulfillmentType?: OnlineFulfillmentType

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryAddress?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryCity?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryNotes?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  paymentMethod?: string
}

export class OrderSerialSelectionDto implements OrderSerialSelection {
  @IsUUID()
  productId!: string

  @IsOptional()
  @IsUUID()
  variantId?: string | null

  @IsArray()
  @IsUUID('all', { each: true })
  serialUnitIds!: string[]
}

export class UpdateOrderStatusDto implements UpdateOrderStatusRequest {
  @ApiProperty({ enum: ORDER_STATUSES })
  @IsIn(ORDER_STATUSES)
  status!: OnlineOrderStatus

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  internalNote?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerMessage?: string

  @ApiPropertyOptional({ type: [OrderSerialSelectionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderSerialSelectionDto)
  serialUnitSelections?: OrderSerialSelectionDto[]
}

const PAYMENT_STATUSES: OnlinePaymentStatus[] = [
  'PENDING',
  'AUTHORIZED',
  'PAID',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
]

export class UpdateOrderPaymentDto implements UpdateOrderPaymentRequest {
  @ApiProperty({ enum: PAYMENT_STATUSES })
  @IsIn(PAYMENT_STATUSES)
  paymentStatus!: OnlinePaymentStatus

  @ApiPropertyOptional({ enum: ONLINE_PAYMENT_METHODS })
  @IsOptional()
  @IsIn(ONLINE_PAYMENT_METHODS)
  paymentMethod?: (typeof ONLINE_PAYMENT_METHODS)[number] | null
}
