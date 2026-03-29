import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BaseRepository } from '@/common/repositories/base.repository'
import { ProductCategory } from '@/entities/product-category.entity'

@Injectable()
export class SyncProductCategoriesRepository extends BaseRepository<ProductCategory> {
  constructor(@InjectRepository(ProductCategory) repo: Repository<ProductCategory>) {
    super(repo)
  }
}
