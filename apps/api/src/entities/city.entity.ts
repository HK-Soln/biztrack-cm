import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/** Spec 10 ③ — a city within a region (global reference; a convenience select, city may also be typed). */
@Entity('cities')
@Index('idx_cities_country_region', ['countryIso2', 'regionName'])
export class City {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'country_iso2', length: 2 })
  countryIso2!: string

  @Column({ name: 'region_name', length: 120 })
  regionName!: string

  @Column({ length: 160 })
  name!: string
}
