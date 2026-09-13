import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * Spec 10 ③ — a country in the global geography reference set (shared across all businesses, read-only).
 * Keyed by ISO 3166-1 alpha-2 (e.g. 'CM'). Seeded; expanded as new markets are needed.
 */
@Entity('countries')
export class Country {
  @PrimaryColumn({ length: 2 })
  iso2!: string

  @Index('idx_countries_name')
  @Column({ length: 120 })
  name!: string
}
