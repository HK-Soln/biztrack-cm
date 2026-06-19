import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PurchaseOrder } from '@/entities/purchase-order.entity'
import { PurchaseOrderItem } from '@/entities/purchase-order-item.entity'
import { Product } from '@/entities/product.entity'
import { Contact } from '@/entities/contact.entity'
import { AuditModule } from '@/modules/audit/audit.module'
import { PermissionsModule } from '@/modules/permissions/permissions.module'
import { RfqsModule } from '@/modules/rfqs/rfqs.module'
import { PurchaseOrdersController } from './controllers/purchase-orders.controller'
import { PurchaseOrdersService } from './services/purchase-orders.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([PurchaseOrder, PurchaseOrderItem, Product, Contact]),
    AuditModule,
    PermissionsModule,
    RfqsModule,
  ],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
