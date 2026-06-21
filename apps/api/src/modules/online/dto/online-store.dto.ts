import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
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
  OnlineCatalogBinding,
  OnlineStoreAppearance,
  OnlineStoreLayout,
  ProductOnlineFields,
  UpdateOnlineStoreRequest,
} from '@biztrack/types'

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
