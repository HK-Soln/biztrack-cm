import { cache } from 'react'
import { headers } from 'next/headers'
import type { PublicStore } from '@biztrack/types'
import { getStore } from './api'
import { slugFromHost } from './host'

/** The current request's store slug, from the Host header (server components). */
export async function getStoreSlug(): Promise<string | null> {
  return slugFromHost((await headers()).get('host'))
}

/**
 * The current request's store. Wrapped in React `cache` so the layout and `generateMetadata`
 * share a single fetch per request instead of each hitting the API.
 *
 * `null` means there is no shop on this host; a thrown error means the API could not be reached
 * (see `getStore`) — the two must stay distinct, since only the former redirects to marketing.
 */
export const getCurrentStore = cache(async (): Promise<PublicStore | null> => {
  const slug = await getStoreSlug()
  return slug ? getStore(slug) : null
})
