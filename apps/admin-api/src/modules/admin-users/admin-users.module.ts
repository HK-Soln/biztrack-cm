import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AdminUser } from '@/entities/admin-user.entity'
import { AdminRole } from '@/entities/admin-role.entity'
import { AdminRefreshToken } from '@/entities/admin-refresh-token.entity'
import { AdminUsersController } from './admin-users.controller'
import { AdminUsersService } from './admin-users.service'

@Module({
  imports: [TypeOrmModule.forFeature([AdminUser, AdminRole, AdminRefreshToken])],
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
})
export class AdminUsersModule {}
