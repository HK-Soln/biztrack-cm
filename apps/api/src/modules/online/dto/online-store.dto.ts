import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsHexColor,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator'
import type {
  CreateOnlineStoreRequest,
  OnlineAdminProductsQuery,
  OnlineCatalogBinding,
  OnlineStoreAppearance,
  OnlineStoreLayout,
  ProductOnlineFields,
  UpdateOnlineStoreRequest,
} from '@biztrack/types'

function toBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return value as boolean
}

export class CreateOnlineStoreDto implements CreateOnlineStoreRequest {
  @ApiProperty({ example: 'Akwa Boutique' })
  @IsString()
  @MaxLength(200)
  storeName!: string

  @ApiPropertyOptional({ description: 'URL slug; generated from the name if omitted.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  storeSlug?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  tagline?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logoUrl?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bannerUrl?: string

  @ApiPropertyOptional({ example: '#1D9E75' })
  @IsOptional()
  @IsHexColor()
  primaryColor?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsappNumber?: string
}

export class UpdateOnlineStoreDto implements UpdateOnlineStoreRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  storeName?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  tagline?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logoUrl?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bannerUrl?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsHexColor()
  primaryColor?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsappNumber?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showOutOfStock?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowOrderNotes?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minOrderAmount?: number | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  paymentCashOnDelivery?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  paymentMtnMomo?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  paymentOrangeMoney?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  paymentCard?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  offerDelivery?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  offerPickup?: boolean

  @ApiPropertyOptional({ description: 'Flat delivery fee in whole store-currency units.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  deliveryFee?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pickupAddress?: string | null

  @ApiPropertyOptional({ type: [String], description: 'Cities/zones the store delivers to.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  deliveryCities?: string[]

  @ApiPropertyOptional({ description: 'URL slug (subdomain).' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  storeSlug?: string

  @ApiPropertyOptional({ enum: ['classic', 'boutique', 'catalog', 'landing'] })
  @IsOptional()
  @IsIn(['classic', 'boutique', 'catalog', 'landing'])
  layoutTemplate?: OnlineStoreLayout

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  themeId?: string

  @ApiPropertyOptional({ enum: ['light', 'dark'] })
  @IsOptional()
  @IsIn(['light', 'dark'])
  appearance?: OnlineStoreAppearance

  @ApiPropertyOptional({ enum: ['snapshot', 'live'] })
  @IsOptional()
  @IsIn(['snapshot', 'live'])
  catalogBinding?: OnlineCatalogBinding

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showLowStockBadges?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  seoTitle?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  seoDescription?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ogImageUrl?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  robotsIndex?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  socialInstagram?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  socialFacebook?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  socialTiktok?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  socialX?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  socialLinkedin?: string | null
}

export class ListOnlineProductsDto implements OnlineAdminProductsQuery {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string

  @ApiPropertyOptional({ description: 'true = published only, false = drafts only, omitted = all' })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  published?: boolean
}

export class UpdateProductOnlineDto implements ProductOnlineFields {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublishedOnline?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  onlineDescription?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  metaTitle?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaDescription?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  onlineSortOrder?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  onlineStockReserve?: number
}
