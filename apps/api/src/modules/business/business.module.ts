import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BusinessController } from './business.controller'
import { BusinessService } from './business.service'
import { Business } from '../../entities/business.entity'
import { User } from '../../entities/user.entity'
import { BusinessesRepository } from './repositories/businesses.repository'
import { BusinessUsersRepository } from './repositories/business-users.repository'

@Module({
  imports: [TypeOrmModule.forFeature([Business, User])],
  controllers: [BusinessController],
  providers: [BusinessesRepository, BusinessUsersRepository, BusinessService],
  exports: [BusinessService],
})
export class BusinessModule {}
