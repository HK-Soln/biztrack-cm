import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ListQuery, PaginatedResult } from '@shared/ipc'

/**
 * Drives a paginated list: page + debounced search state, a TanStack query keyed by
 * (baseKey, page, search), and `keepPreviousData` so the list doesn't flash while
 * paging/searching. Invalidating `baseKey` (prefix match) refreshes every page.
 */
export function usePaged<T>(
  baseKey: readonly unknown[],
  fetcher: (query: ListQuery) => Promise<PaginatedResult<T>>,
  opts: { enabled?: boolean; extra?: Record<string, unknown> } = {},
) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  // New search term → back to the first page.
  useEffect(() => {
    setPage(1)
  }, [debounced])

  const extra = opts.extra ?? {}
  const query = useQuery({
    queryKey: [...baseKey, page, debounced, extra],
    queryFn: () => fetcher({ page, search: debounced || undefined, ...extra }),
    enabled: opts.enabled ?? true,
    placeholderData: keepPreviousData,
  })

  return {
    items: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    page: query.data?.page ?? page,
    limit: query.data?.limit ?? 20,
    totalPages: query.data?.totalPages ?? 1,
    isPending: query.isPending,
    setPage,
    search,
    setSearch,
  }
}
