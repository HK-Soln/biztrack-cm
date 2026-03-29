import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { decimalTransformer } from '@/common/entities/transformers'
import { Sale } from './sale.entity'
import { Product } from './product.entity'

@Entity('sale_items')
@Index('idx_sale_items_sale_id', ['saleId'])
@Index('idx_sale_items_product_id', ['productId'])
export class SaleItem extends BaseEntity {
  @Column({ name: 'sale_id' })
  saleId!: string

  @ManyToOne(() => Sale, (sale) => sale.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id', foreignKeyConstraintName: 'fk_sale_items_sale_id' })
  sale?: Sale

  @Column({ name: 'product_id' })
  productId!: string

  @ManyToOne(() => Product, (product) => product.saleItems)
  @JoinColumn({ name: 'product_id', foreignKeyConstraintName: 'fk_sale_items_product_id' })
  product?: Product

  @Column({ name: 'product_name' })
  productName!: string

  @Column({ type: 'decimal', precision: 10, scale: 3, transformer: decimalTransformer })
  quantity!: number

  @Column({
    name: 'unit_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  unitPrice!: number

  @Column({
    name: 'total_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  totalPrice!: number
}
