import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Brand } from '@/entities/brand.entity'
import { BrandCategory } from '@/entities/brand-category.entity'
import { Model } from '@/entities/model.entity'
import { AuditModule } from '@/modules/audit/audit.module'
import { PermissionsModule } from '@/modules/permissions/permissions.module'
import { BrandsController } from './controllers/brands.controller'
import { BrandsService } from './services/brands.service'

@Module({
  imports: [TypeOrmModule.forFeature([Brand, Model, BrandCategory]), AuditModule, PermissionsModule],
  controllers: [BrandsController],
  providers: [BrandsService],
  exports: [BrandsService],
})
export class BrandsModule {}
