import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { OnlineStore } from '@/entities/online-store.entity'
import { OnlineStorePublication } from '@/entities/online-store-publication.entity'
import { OnlineCart } from '@/entities/online-cart.entity'
import { OnlineOrder } from '@/entities/online-order.entity'
import { OnlineOrderEvent } from '@/entities/online-order-event.entity'
import { Business } from '@/entities/business.entity'
import { Product } from '@/entities/product.entity'
import { ProductVariant } from '@/entities/product-variant.entity'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { ProductImage } from '@/entities/product-image.entity'
import { ProductSerialUnit } from '@/entities/product-serial-unit.entity'
import { ProductsModule } from '@/modules/products/products.module'
import { SalesModule } from '@/modules/sales/sales.module'
import { PermissionsModule } from '@/modules/permissions/permissions.module'
import { OnlineStoreController } from './online-store.controller'
import { OnlineStoreService } from './online-store.service'
import { PublicStorefrontController } from './public-storefront.controller'
import { PublicStorefrontService } from './public-storefront.service'
import { OnlineOrdersController } from './online-orders.controller'
import { OnlineOrdersService } from './online-orders.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Business,
      OnlineStore,
      OnlineStorePublication,
      OnlineCart,
      OnlineOrder,
      OnlineOrderEvent,
      Product,
      ProductVariant,
      InventoryLevel,
      ProductImage,
      ProductSerialUnit,
    ]),
    ProductsModule,
    SalesModule,
    PermissionsModule,
  ],
  controllers: [OnlineStoreController, PublicStorefrontController, OnlineOrdersController],
  providers: [OnlineStoreService, PublicStorefrontService, OnlineOrdersService],
  exports: [OnlineStoreService, OnlineOrdersService],
})
export class OnlineModule {}
