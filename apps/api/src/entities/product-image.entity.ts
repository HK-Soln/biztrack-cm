import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { dateTransformer } from '@/common/entities/transformers'
import { Product } from './product.entity'

@Entity('product_images')
@Index('idx_product_images_business_id', ['businessId'])
export class ProductImage {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  // Carried directly (in addition to product_id) for tenant-scoped sync queries.
  @Column({ name: 'business_id', type: 'uuid', nullable: true })
  businessId?: string | null

  @Column({ name: 'product_id' })
  productId!: string

  @ManyToOne(() => Product, (product) => product.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id', foreignKeyConstraintName: 'fk_product_images_product_id' })
  product?: Product

  @Column({ length: 500 })
  url!: string

  @Column({ name: 'alt_text', nullable: true, length: 200, type: 'varchar' })
  altText?: string | null

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number

  @CreateDateColumn({ name: 'created_at', transformer: dateTransformer })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', transformer: dateTransformer })
  updatedAt!: Date

  @DeleteDateColumn({ name: 'deleted_at', transformer: dateTransformer })
  deletedAt?: Date | null
}
