import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { OnlineStore } from '@/entities/online-store.entity'
import { Product } from '@/entities/product.entity'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { ProductImage } from '@/entities/product-image.entity'
import { ProductSerialUnit } from '@/entities/product-serial-unit.entity'
import { ProductsModule } from '@/modules/products/products.module'
import { OnlineStoreController } from './online-store.controller'
import { OnlineStoreService } from './online-store.service'
import { PublicStorefrontController } from './public-storefront.controller'
import { PublicStorefrontService } from './public-storefront.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([OnlineStore, Product, InventoryLevel, ProductImage, ProductSerialUnit]),
    ProductsModule,
  ],
  controllers: [OnlineStoreController, PublicStorefrontController],
  providers: [OnlineStoreService, PublicStorefrontService],
  exports: [OnlineStoreService],
})
export class OnlineModule {}
