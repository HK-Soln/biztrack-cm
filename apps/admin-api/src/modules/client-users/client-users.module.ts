import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClientUser } from '@/entities/read/client-user.entity'
import { BusinessMember } from '@/entities/read/business-member.entity'
import { ClientUsersController } from './client-users.controller'
import { ClientUsersService } from './client-users.service'

@Module({
  imports: [TypeOrmModule.forFeature([ClientUser, BusinessMember])],
  controllers: [ClientUsersController],
  providers: [ClientUsersService],
})
export class ClientUsersModule {}
