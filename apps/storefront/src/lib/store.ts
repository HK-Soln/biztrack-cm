import { headers } from 'next/headers'
import { slugFromHost } from './host'

/** The current request's store slug, from the Host header (server components). */
export async function getStoreSlug(): Promise<string | null> {
  return slugFromHost((await headers()).get('host'))
}
