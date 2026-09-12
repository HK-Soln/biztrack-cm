import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { CityView, CountryView, RegionView } from '@biztrack/types'
import { Country } from '@/entities/country.entity'
import { Region } from '@/entities/region.entity'
import { City } from '@/entities/city.entity'

/** Spec 10 ③ — read the global geography reference (countries → regions → cities). */
@Injectable()
export class GeoService {
  constructor(
    @InjectRepository(Country) private readonly countries: Repository<Country>,
    @InjectRepository(Region) private readonly regions: Repository<Region>,
    @InjectRepository(City) private readonly cities: Repository<City>,
  ) {}

  async listCountries(): Promise<CountryView[]> {
    const rows = await this.countries.find({ order: { name: 'ASC' } })
    return rows.map((c) => ({ iso2: c.iso2, name: c.name }))
  }

  async listRegions(countryIso2: string): Promise<RegionView[]> {
    const rows = await this.regions.find({
      where: { countryIso2: countryIso2.toUpperCase() },
      order: { name: 'ASC' },
    })
    return rows.map((r) => ({ id: r.id, countryIso2: r.countryIso2, name: r.name }))
  }

  async listCities(countryIso2: string, regionName: string): Promise<CityView[]> {
    const rows = await this.cities.find({
      where: { countryIso2: countryIso2.toUpperCase(), regionName },
      order: { name: 'ASC' },
    })
    return rows.map((c) => ({
      id: c.id,
      countryIso2: c.countryIso2,
      regionName: c.regionName,
      name: c.name,
    }))
  }
}
