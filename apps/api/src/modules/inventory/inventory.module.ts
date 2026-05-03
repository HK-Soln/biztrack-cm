import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Business } from '@/entities/business.entity'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { InventoryMovement } from '@/entities/inventory-movement.entity'
import { ProductImage } from '@/entities/product-image.entity'
import { Product } from '@/entities/product.entity'
import { RestockItem } from '@/entities/restock-item.entity'
import { RestockPayment } from '@/entities/restock-payment.entity'
import { RestockRecord } from '@/entities/restock-record.entity'
import { DebtsModule } from '@/modules/debts/debts.module'
import { PermissionsModule } from '@/modules/permissions/permissions.module'
import { INVENTORY_ALERTS_QUEUE } from './constants/inventory.constants'
import { InventoryController } from './controllers/inventory.controller'
import { InventoryAlertsProcessor } from './processors/inventory-alerts.processor'
import { InventoryAlertsScheduler } from './schedulers/inventory-alerts.scheduler'
import { InventoryService } from './services/inventory.service'
import { RedisModule } from '@/common/redis/redis.module'

@Module({
  imports: [
    PermissionsModule,
    DebtsModule,
    BullModule.registerQueue({
      name: INVENTORY_ALERTS_QUEUE,
    }),
    TypeOrmModule.forFeature([
      Business,
      InventoryLevel,
      InventoryMovement,
      ProductImage,
      Product,
      RestockItem,
      RestockPayment,
      RestockRecord,
    ]),
    RedisModule,
  ],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryAlertsScheduler,
    InventoryAlertsProcessor
  ],
  exports: [InventoryService],
})
export class InventoryModule { }
