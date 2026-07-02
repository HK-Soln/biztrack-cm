/**
 * Redis key + TTL for the per-request membership-status check used by JwtStrategy.
 * Caching the status keeps phase-2 auth off the DB on every request; the key is
 * deleted (invalidated) whenever a member is suspended, reactivated or removed, so the
 * change takes effect on the next request.
 */
export const MEMBER_STATUS_TTL_SECONDS = 300

export function memberStatusCacheKey(businessId: string, userId: string): string {
  return `member:status:${businessId}:${userId}`
}
