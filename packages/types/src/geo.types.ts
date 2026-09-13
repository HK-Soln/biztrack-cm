// Spec 10 ③ — global geography reference data (countries → regions → cities). Shared, read-only for
// businesses; used to populate structured-address selects at checkout and to match delivery zones.

export interface CountryView {
  iso2: string
  name: string
}

export interface RegionView {
  id: string
  countryIso2: string
  name: string
}

export interface CityView {
  id: string
  countryIso2: string
  regionName: string
  name: string
}
