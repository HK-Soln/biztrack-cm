/** Redis key holding an admin's cached effective permissions ({ permissions, scopes }). */
export const adminPermissionsCacheKey = (adminUserId: string) => `admin_permissions:${adminUserId}`

/**
 * Redis key the CLIENT API (apps/api) uses to cache a business's effective resources
 * (`permissions.service.ts`). The admin API deletes this key after suspend / override /
 * subscription / plan changes so businesses pick up the change immediately. Must stay
 * byte-for-byte identical to the client's key.
 */
export const businessPermissionsCacheKey = (businessId: string) => `permissions:${businessId}`
