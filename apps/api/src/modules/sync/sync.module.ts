import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SyncController } from './sync.controller'
import { SyncService } from './sync.service'
import { Product } from '../../entities/product.entity'
import { ProductCategory } from '../../entities/product-category.entity'
import { SyncLog } from '../../entities/sync-log.entity'
import { SyncProductsRepository } from './repositories/sync-products.repository'
import { SyncProductCategoriesRepository } from './repositories/sync-product-categories.repository'
import { SyncLogsRepository } from './repositories/sync-logs.repository'

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductCategory, SyncLog])],
  controllers: [SyncController],
  providers: [
    SyncProductsRepository,
    SyncProductCategoriesRepository,
    SyncLogsRepository,
    SyncService,
  ],
})
export class SyncModule {}
