import type { Request, Response } from 'express'
import type { AdminJwtPayload, PermissionScope } from '../auth/admin-jwt-payload'

export interface RequestWithId extends Request {
  id: string
  admin?: AdminJwtPayload
  permissionScope?: PermissionScope | null
}

export interface ResponseWithId extends Response {
  req: RequestWithId
}
