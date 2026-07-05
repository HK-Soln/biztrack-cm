import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm'
import type { OnlineStoreDomainType } from '@biztrack/types'
import { BaseEntity } from '@/common/entities/base.entity'
import { dateTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'

/** A business's online storefront configuration (Phase 3I). One per business. */
@Entity('online_stores')
@Index('idx_online_stores_slug', ['storeSlug'])
export class OnlineStore extends BaseEntity {
  @Column({ name: 'business_id', unique: true })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_online_stores_business_id' })
  business?: Business

  @Column({ name: 'store_name', length: 200 })
  storeName!: string

  @Column({ name: 'store_slug', length: 100, unique: true })
  storeSlug!: string

  @Column({ length: 500, nullable: true, type: 'varchar' })
  tagline?: string | null

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl?: string | null

  @Column({ name: 'banner_url', type: 'text', nullable: true })
  bannerUrl?: string | null

  @Column({ name: 'primary_color', length: 7, default: '#1D9E75' })
  primaryColor!: string

  @Column({ length: 30, nullable: true, type: 'varchar' })
  phone?: string | null

  @Column({ length: 300, nullable: true, type: 'varchar' })
  email?: string | null

  @Column({ type: 'text', nullable: true })
  address?: string | null

  @Column({ length: 100, nullable: true, type: 'varchar' })
  city?: string | null

  @Column({ name: 'whatsapp_number', length: 30, nullable: true, type: 'varchar' })
  whatsappNumber?: string | null

  @Column({ name: 'domain_type', length: 20, default: 'SUBDOMAIN' })
  domainType!: OnlineStoreDomainType

  @Column({ name: 'custom_domain', length: 300, nullable: true, type: 'varchar' })
  customDomain?: string | null

  @Column({ name: 'domain_verified', default: false })
  domainVerified!: boolean

  @Column({ name: 'ssl_issued', default: false })
  sslIssued!: boolean

  @Column({ name: 'is_active', default: true })
  isActive!: boolean

  @Column({ name: 'show_out_of_stock', default: false })
  showOutOfStock!: boolean

  @Column({ name: 'allow_order_notes', default: true })
  allowOrderNotes!: boolean

  @Column({ name: 'min_order_amount', type: 'int', nullable: true })
  minOrderAmount?: number | null

  @Column({ length: 3, default: 'XAF' })
  currency!: string

  @Column({ name: 'payment_cash_on_delivery', default: true })
  paymentCashOnDelivery!: boolean

  @Column({ name: 'payment_mtn_momo', default: false })
  paymentMtnMomo!: boolean

  @Column({ name: 'payment_orange_money', default: false })
  paymentOrangeMoney!: boolean

  @Column({ name: 'payment_card', default: false })
  paymentCard!: boolean

  // ---- Fulfilment (delivery / pickup) ----
  @Column({ name: 'offer_delivery', default: true })
  offerDelivery!: boolean

  @Column({ name: 'offer_pickup', default: true })
  offerPickup!: boolean

  /** Flat delivery fee in whole store-currency units (XAF). */
  @Column({ name: 'delivery_fee', type: 'int', default: 0 })
  deliveryFee!: number

  @Column({ name: 'pickup_address', type: 'text', nullable: true })
  pickupAddress?: string | null

  /** Cities/zones the store delivers to (empty = no restriction). */
  @Column({ name: 'delivery_cities', type: 'jsonb', default: () => "'[]'" })
  deliveryCities!: string[]

  // ---- Storefront appearance (design-store-config) ----
  /** Layout template: classic | boutique | catalog | landing. */
  @Column({ name: 'layout_template', length: 20, default: 'classic' })
  layoutTemplate!: string

  /** Colour theme preset key (a|b|c|d), reusing the packages/theme palettes. */
  @Column({ name: 'theme_id', length: 20, default: 'a' })
  themeId!: string

  /** Storefront appearance: light | dark. */
  @Column({ length: 10, default: 'light' })
  appearance!: string

  // ---- Catalog & pricing ----
  /** snapshot | live — how the public store reads prices/stock. */
  @Column({ name: 'catalog_binding', length: 10, default: 'snapshot' })
  catalogBinding!: string

  @Column({ name: 'show_low_stock_badges', default: false })
  showLowStockBadges!: boolean

  // ---- SEO & sharing ----
  @Column({ name: 'seo_title', length: 120, nullable: true, type: 'varchar' })
  seoTitle?: string | null

  @Column({ name: 'seo_description', length: 300, nullable: true, type: 'varchar' })
  seoDescription?: string | null

  @Column({ name: 'og_image_url', type: 'text', nullable: true })
  ogImageUrl?: string | null

  @Column({ name: 'robots_index', default: true })
  robotsIndex!: boolean

  @Column({ name: 'social_instagram', length: 200, nullable: true, type: 'varchar' })
  socialInstagram?: string | null

  @Column({ name: 'social_facebook', length: 200, nullable: true, type: 'varchar' })
  socialFacebook?: string | null

  @Column({ name: 'social_tiktok', length: 200, nullable: true, type: 'varchar' })
  socialTiktok?: string | null

  @Column({ name: 'social_x', length: 200, nullable: true, type: 'varchar' })
  socialX?: string | null

  @Column({ name: 'social_linkedin', length: 200, nullable: true, type: 'varchar' })
  socialLinkedin?: string | null

  // ---- Lifecycle (draft → published → suspended) ----
  @Column({ length: 12, default: 'draft' })
  status!: string

  @Column({
    name: 'published_at',
    type: 'timestamptz',
    nullable: true,
    transformer: dateTransformer,
  })
  publishedAt?: Date | null

  /** Set on any config edit, cleared on publish — drives the "unpublished changes" chip. */
  @Column({ name: 'has_unpublished_changes', default: true })
  hasUnpublishedChanges!: boolean
}
