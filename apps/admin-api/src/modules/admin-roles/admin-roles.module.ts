import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AdminRole } from '@/entities/admin-role.entity'
import { AdminRolePermission } from '@/entities/admin-role-permission.entity'
import { AdminUser } from '@/entities/admin-user.entity'
import { AdminRolesController } from './admin-roles.controller'
import { AdminRolesService } from './admin-roles.service'

@Module({
  imports: [TypeOrmModule.forFeature([AdminRole, AdminRolePermission, AdminUser])],
  controllers: [AdminRolesController],
  providers: [AdminRolesService],
})
export class AdminRolesModule {}
