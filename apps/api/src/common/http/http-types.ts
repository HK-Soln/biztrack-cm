import type { Request, Response } from 'express'
import type { JwtPayload } from '@biztrack/types'

export interface RequestWithId extends Request {
  id: string
  user?: JwtPayload
}

export interface ResponseWithId extends Response {
  req: RequestWithId
}
