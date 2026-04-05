import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BusinessController } from './business.controller'
import { BusinessesController } from './businesses.controller'
import { BusinessService } from './business.service'
import { Business } from '../../entities/business.entity'
import { User } from '../../entities/user.entity'
import { BusinessMember } from '../../entities/business-member.entity'
import { BusinessesRepository } from './repositories/businesses.repository'
import { BusinessMembersRepository } from './repositories/business-members.repository'

@Module({
  imports: [TypeOrmModule.forFeature([Business, User, BusinessMember])],
  controllers: [BusinessController, BusinessesController],
  providers: [BusinessesRepository, BusinessMembersRepository, BusinessService],
  exports: [BusinessService, BusinessesRepository],
})
export class BusinessModule {}
