import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ChargeType } from '@/entities/charge-type.entity'
import { ChargesController } from './charges.controller'

@Module({
  imports: [TypeOrmModule.forFeature([ChargeType])],
  controllers: [ChargesController],
})
export class ChargesModule {}
