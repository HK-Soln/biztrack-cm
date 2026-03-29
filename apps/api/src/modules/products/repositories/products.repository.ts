import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BaseRepository } from '@/common/repositories/base.repository'
import { Product } from '@/entities/product.entity'

@Injectable()
export class ProductsRepository extends BaseRepository<Product> {
  constructor(@InjectRepository(Product) repo: Repository<Product>) {
    super(repo)
  }
}
