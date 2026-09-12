/**
 * Spec 10 ③ — global geography reference seed: countries → regions → cities. Currently Cameroon,
 * Nigeria, UAE (the active + near-term markets); more countries are added here as needed. Shared,
 * read-only reference data — not per-business. Regions are the controlled matching level for delivery
 * zones; cities are a convenience select (checkout also allows a typed city).
 */
export interface GeoSeedCountry {
  iso2: string
  name: string
  regions: { name: string; cities: string[] }[]
}

export const GEO_SEED: GeoSeedCountry[] = [
  {
    iso2: 'CM',
    name: 'Cameroon',
    regions: [
      { name: 'Adamawa', cities: ['Ngaoundéré', 'Meiganga', 'Tibati', 'Banyo'] },
      { name: 'Centre', cities: ['Yaoundé', 'Mbalmayo', 'Obala', 'Bafia', 'Mfou', 'Nanga Eboko'] },
      { name: 'East', cities: ['Bertoua', 'Batouri', 'Abong-Mbang', 'Yokadouma'] },
      { name: 'Far North', cities: ['Maroua', 'Kousséri', 'Mokolo', 'Yagoua', 'Mora'] },
      { name: 'Littoral', cities: ['Douala', 'Nkongsamba', 'Edéa', 'Loum', 'Mbanga'] },
      { name: 'North', cities: ['Garoua', 'Guider', 'Poli', 'Figuil'] },
      { name: 'Northwest', cities: ['Bamenda', 'Kumbo', 'Ndop', 'Wum', 'Mbengwi'] },
      { name: 'South', cities: ['Ebolowa', 'Kribi', 'Sangmélima', 'Ambam'] },
      { name: 'Southwest', cities: ['Buea', 'Limbe', 'Kumba', 'Tiko', 'Mamfe', 'Mutengene'] },
      { name: 'West', cities: ['Bafoussam', 'Dschang', 'Foumban', 'Mbouda', 'Bafang', 'Bandjoun'] },
    ],
  },
  {
    iso2: 'NG',
    name: 'Nigeria',
    regions: [
      { name: 'Abia', cities: ['Umuahia', 'Aba'] },
      { name: 'Adamawa', cities: ['Yola', 'Mubi'] },
      { name: 'Akwa Ibom', cities: ['Uyo', 'Eket'] },
      { name: 'Anambra', cities: ['Awka', 'Onitsha', 'Nnewi'] },
      { name: 'Bauchi', cities: ['Bauchi', 'Azare'] },
      { name: 'Bayelsa', cities: ['Yenagoa'] },
      { name: 'Benue', cities: ['Makurdi', 'Gboko'] },
      { name: 'Borno', cities: ['Maiduguri'] },
      { name: 'Cross River', cities: ['Calabar', 'Ugep'] },
      { name: 'Delta', cities: ['Asaba', 'Warri', 'Sapele'] },
      { name: 'Ebonyi', cities: ['Abakaliki'] },
      { name: 'Edo', cities: ['Benin City', 'Auchi'] },
      { name: 'Ekiti', cities: ['Ado-Ekiti'] },
      { name: 'Enugu', cities: ['Enugu', 'Nsukka'] },
      { name: 'Gombe', cities: ['Gombe'] },
      { name: 'Imo', cities: ['Owerri', 'Orlu'] },
      { name: 'Jigawa', cities: ['Dutse', 'Hadejia'] },
      { name: 'Kaduna', cities: ['Kaduna', 'Zaria'] },
      { name: 'Kano', cities: ['Kano'] },
      { name: 'Katsina', cities: ['Katsina', 'Funtua'] },
      { name: 'Kebbi', cities: ['Birnin Kebbi'] },
      { name: 'Kogi', cities: ['Lokoja', 'Okene'] },
      { name: 'Kwara', cities: ['Ilorin', 'Offa'] },
      { name: 'Lagos', cities: ['Lagos', 'Ikeja', 'Lekki', 'Ikorodu', 'Epe', 'Badagry'] },
      { name: 'Nasarawa', cities: ['Lafia', 'Keffi'] },
      { name: 'Niger', cities: ['Minna', 'Bida', 'Suleja'] },
      { name: 'Ogun', cities: ['Abeokuta', 'Ijebu Ode', 'Sagamu'] },
      { name: 'Ondo', cities: ['Akure', 'Ondo'] },
      { name: 'Osun', cities: ['Osogbo', 'Ile-Ife', 'Ilesa'] },
      { name: 'Oyo', cities: ['Ibadan', 'Ogbomoso', 'Oyo'] },
      { name: 'Plateau', cities: ['Jos', 'Bukuru'] },
      { name: 'Rivers', cities: ['Port Harcourt', 'Bonny'] },
      { name: 'Sokoto', cities: ['Sokoto'] },
      { name: 'Taraba', cities: ['Jalingo', 'Wukari'] },
      { name: 'Yobe', cities: ['Damaturu', 'Potiskum'] },
      { name: 'Zamfara', cities: ['Gusau', 'Kaura Namoda'] },
      { name: 'Federal Capital Territory', cities: ['Abuja', 'Gwagwalada', 'Kuje'] },
    ],
  },
  {
    iso2: 'AE',
    name: 'United Arab Emirates',
    regions: [
      { name: 'Abu Dhabi', cities: ['Abu Dhabi', 'Al Ain', 'Madinat Zayed'] },
      { name: 'Dubai', cities: ['Dubai'] },
      { name: 'Sharjah', cities: ['Sharjah', 'Khor Fakkan', 'Kalba'] },
      { name: 'Ajman', cities: ['Ajman'] },
      { name: 'Umm Al Quwain', cities: ['Umm Al Quwain'] },
      { name: 'Ras Al Khaimah', cities: ['Ras Al Khaimah'] },
      { name: 'Fujairah', cities: ['Fujairah', 'Dibba Al-Fujairah'] },
    ],
  },
]
