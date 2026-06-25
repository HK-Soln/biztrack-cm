import { SetMetadata } from '@nestjs/common'

export const REQUIRED_PERMISSION_KEY = 'required_permission'

/** Declares the permission string a handler requires, e.g. @RequirePermission('businesses:view'). */
export const RequirePermission = (permission: string) => SetMetadata(REQUIRED_PERMISSION_KEY, permission)
