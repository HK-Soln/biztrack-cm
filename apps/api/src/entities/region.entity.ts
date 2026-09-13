import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/** Spec 10 ③ — a region/state/emirate within a country (global reference; matched by name). */
@Entity('regions')
@Index('idx_regions_country', ['countryIso2'])
export class Region {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'country_iso2', length: 2 })
  countryIso2!: string

  @Column({ length: 120 })
  name!: string
}
