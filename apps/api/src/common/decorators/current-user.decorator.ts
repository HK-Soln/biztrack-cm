import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { JwtPayload } from '@biztrack/types'

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>()
    return request.user
  },
)
