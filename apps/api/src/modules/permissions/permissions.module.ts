import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RedisModule } from '@/common/redis/redis.module'
import { Business } from '@/entities/business.entity'
import { BusinessOverride } from '@/entities/business-override.entity'
import { PlanConfig } from '@/entities/plan-config.entity'
import { BusinessesRepository } from '@/modules/business/repositories/businesses.repository'
import { PlanConfigsRepository } from './repositories/plan-configs.repository'
import { BusinessOverridesRepository } from './repositories/business-overrides.repository'
import { PermissionsService } from './permissions.service'
import { ResourceGuard } from './guards/resource.guard'

@Module({
  imports: [RedisModule, TypeOrmModule.forFeature([Business, PlanConfig, BusinessOverride])],
  providers: [
    BusinessesRepository,
    PlanConfigsRepository,
    BusinessOverridesRepository,
    PermissionsService,
    ResourceGuard,
  ],
  exports: [PermissionsService, ResourceGuard],
})
export class PermissionsModule {}
