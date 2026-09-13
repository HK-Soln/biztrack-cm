import { cache } from 'react'
import { headers } from 'next/headers'
import type { PublicStore } from '@biztrack/types'
import { getStore } from './api'
import { parseHost, type HostInfo } from './host'

/**
 * The current request's host context — `{ slug, preview }`. Wrapped in React `cache` so the layout,
 * pages, and `generateMetadata` share a single header read per request. `preview` is true on a
 * `preview.<slug>` host, which reads the draft config and blocks ordering.
 */
export const getStoreContext = cache(async (): Promise<HostInfo> => {
  return parseHost((await headers()).get('host'))
})

/** The current request's store slug, from the Host header (server components). */
export async function getStoreSlug(): Promise<string | null> {
  return (await getStoreContext()).slug
}

/** True when the current request is a draft-preview host (`preview.<slug>`). */
export async function isPreview(): Promise<boolean> {
  return (await getStoreContext()).preview
}

/**
 * The current request's store. Wrapped in React `cache` so the layout and `generateMetadata`
 * share a single fetch per request instead of each hitting the API. On a preview host it resolves
 * the draft config (unpublished changes, and stores that have never been published).
 *
 * `null` means there is no shop on this host; a thrown error means the API could not be reached
 * (see `getStore`) — the two must stay distinct, since only the former redirects to marketing.
 */
export const getCurrentStore = cache(async (): Promise<PublicStore | null> => {
  const { slug, preview } = await getStoreContext()
  return slug ? getStore(slug, preview) : null
})
