/** Redis key holding an admin's cached effective permissions ({ permissions, scopes }). */
export const adminPermissionsCacheKey = (adminUserId: string) => `admin_permissions:${adminUserId}`
