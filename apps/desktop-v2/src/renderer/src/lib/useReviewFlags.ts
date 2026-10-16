import { useQuery } from '@tanstack/react-query'
import type { ReviewFlagsCount } from '@biztrack/types'
import { dataClient } from '@/lib/data-client'
import { useCanManage } from '@/lib/useCanManage'
import { useSessionStore } from '@/stores/session.store'

export const REVIEW_FLAGS_PATH = '/activity/review'

/**
 * Whether the signed-in user supervises the tills: the owner, or a role that can authorize.
 * Only decides what the screen offers; the server enforces the rule (`canReviewFlags` in
 * @biztrack/domain).
 */
export function useCanReviewFlags(): boolean {
  const isOwner = (useSessionStore((s) => s.status.user?.role) ?? '').toUpperCase() === 'OWNER'
  const canManage = useCanManage()
  return isOwner || canManage
}

/**
 * Open review flags, for the sidebar badge and the banner. Flags live on the server, so
 * this is undefined while offline; it never blocks the page it is shown on.
 */
export function useOpenReviewFlags(enabled = true): ReviewFlagsCount | undefined {
  const allowed = useCanReviewFlags()
  const query = useQuery({
    queryKey: ['review-flags', 'count'],
    queryFn: () => dataClient.reviewFlags.count(),
    enabled: allowed && enabled,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  })
  return query.data
}
