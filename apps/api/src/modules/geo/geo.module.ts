import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Country } from '@/entities/country.entity'
import { Region } from '@/entities/region.entity'
import { City } from '@/entities/city.entity'
import { GeoService } from './geo.service'
import { GeoController } from './geo.controller'

/** Spec 10 ③ — global geography reference (countries → regions → cities). */
@Module({
  imports: [TypeOrmModule.forFeature([Country, Region, City])],
  controllers: [GeoController],
  providers: [GeoService],
  exports: [GeoService],
})
export class GeoModule {}
