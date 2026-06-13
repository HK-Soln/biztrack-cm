import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm'
import { SerialType, SerialUnitStatus } from '@biztrack/types'
import { BaseEntity } from '@/common/entities/base.entity'
import { Business } from './business.entity'
import { Product } from './product.entity'
import { ProductVariant } from './product-variant.entity'

/**
 * An individually tracked physical unit of a serialised product (Phase 3G).
 * Stock for a serialised product is the count of IN_STOCK units, not a number.
 */
@Entity('product_serial_units')
@Unique('uq_serial_number_per_business', ['businessId', 'serialNumber'])
@Index('idx_serial_units_product_id', ['productId'])
@Index('idx_serial_units_variant_id', ['variantId'])
@Index('idx_serial_units_business_id', ['businessId'])
@Index('idx_serial_units_status', ['status'])
@Index('idx_serial_units_serial', ['serialNumber'])
export class ProductSerialUnit extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_serial_units_business_id' })
  business?: Business

  @Column({ name: 'product_id' })
  productId!: string

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id', foreignKeyConstraintName: 'fk_serial_units_product_id' })
  product?: Product

  @Column({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId?: string | null

  @ManyToOne(() => ProductVariant, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'variant_id', foreignKeyConstraintName: 'fk_serial_units_variant_id' })
  variant?: ProductVariant | null

  @Column({ name: 'serial_number', type: 'varchar', length: 30 })
  serialNumber!: string

  @Column({ name: 'serial_type', type: 'varchar', length: 20 })
  serialType!: SerialType

  @Column({ type: 'varchar', length: 20, default: SerialUnitStatus.IN_STOCK })
  status!: SerialUnitStatus

  @Column({ name: 'reserved_at', type: 'timestamptz', nullable: true })
  reservedAt?: Date | null

  @Column({ name: 'reserved_by', type: 'uuid', nullable: true })
  reservedBy?: string | null

  @Column({ name: 'purchase_price', type: 'int', default: 0 })
  purchasePrice!: number

  @Column({ name: 'supplier_id', type: 'uuid', nullable: true })
  supplierId?: string | null

  @Column({ name: 'restock_id', type: 'uuid', nullable: true })
  restockId?: string | null

  @Column({ name: 'sale_id', type: 'uuid', nullable: true })
  saleId?: string | null

  @Column({ name: 'sale_item_id', type: 'uuid', nullable: true })
  saleItemId?: string | null

  @Column({ name: 'sold_at', type: 'timestamptz', nullable: true })
  soldAt?: Date | null

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId?: string | null

  @Column({ name: 'warranty_expires_at', type: 'timestamptz', nullable: true })
  warrantyExpiresAt?: Date | null

  @Column({ type: 'text', nullable: true })
  notes?: string | null
}
