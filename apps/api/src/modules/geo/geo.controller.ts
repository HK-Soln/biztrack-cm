import { Controller, Get, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { CityView, CountryView, RegionView } from '@biztrack/types'
import { GeoService } from './geo.service'

/** Spec 10 ③ — public geography reference (countries → regions → cities) for structured-address selects. */
@ApiTags('Geography')
@Controller('public/geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get('countries')
  @ApiOperation({ summary: 'List supported countries' })
  countries(): Promise<CountryView[]> {
    return this.geo.listCountries()
  }

  @Get('regions')
  @ApiOperation({ summary: 'List regions for a country (?country=ISO2)' })
  regions(@Query('country') country: string): Promise<RegionView[]> {
    return this.geo.listRegions(country ?? '')
  }

  @Get('cities')
  @ApiOperation({ summary: 'List cities for a region (?country=ISO2&region=Name)' })
  cities(
    @Query('country') country: string,
    @Query('region') region: string,
  ): Promise<CityView[]> {
    if (!country || !region) return Promise.resolve([])
    return this.geo.listCities(country, region)
  }
}
