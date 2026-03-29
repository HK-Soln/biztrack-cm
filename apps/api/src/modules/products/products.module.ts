import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ProductsController } from './products.controller'
import { ProductsService } from './products.service'
import { CategoriesController } from './categories.controller'
import { Product } from '../../entities/product.entity'
import { ProductCategory } from '../../entities/product-category.entity'
import { ProductsRepository } from './repositories/products.repository'
import { ProductCategoriesRepository } from './repositories/product-categories.repository'

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductCategory])],
  controllers: [ProductsController, CategoriesController],
  providers: [ProductsRepository, ProductCategoriesRepository, ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
