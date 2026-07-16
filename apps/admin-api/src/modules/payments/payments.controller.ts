import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { RequirePermission } from '@/common/decorators/require-permission.decorator'
import { AuditAction } from '@/common/decorators/audit-action.decorator'
import { PaymentsService } from './payments.service'

@Controller({ path: 'admin/payments', version: '1' })
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @RequirePermission('payments:view')
  list() {
    return this.paymentsService.list()
  }

  @Get('failures')
  @RequirePermission('payments:view')
  failures() {
    return this.paymentsService.failures()
  }

  @Post(':id/retry')
  @RequirePermission('payments:retry')
  @AuditAction('PAYMENT_RETRY_ATTEMPTED')
  retry(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.retry(id)
  }

  @Post(':id/waive')
  @RequirePermission('payments:waive')
  @AuditAction('PAYMENT_WAIVE_ATTEMPTED')
  waive(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.waive(id)
  }
}
