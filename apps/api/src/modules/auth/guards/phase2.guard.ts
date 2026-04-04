import { ForbiddenException, Injectable } from '@nestjs/common'
import { JwtAuthGuard } from './jwt-auth.guard'
import type { ExecutionContext } from '@nestjs/common'

@Injectable()
export class Phase2Guard extends JwtAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowed = (await super.canActivate(context)) as boolean
    if (!allowed) return false

    const req = context.switchToHttp().getRequest()
    if (req.user?.type !== 'phase2') {
      throw new ForbiddenException({
        code: 'PHASE2_REQUIRED',
        nextStep: 'select_business',
        message: 'i18n:errors.select_business_required',
      })
    }
    return true
  }
}
