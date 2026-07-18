import { Controller, Get, Query } from '@nestjs/common'
import { RequirePermission } from '@/common/decorators/require-permission.decorator'
import { AuditService } from './audit.service'
import { AuditFiltersDto } from './dto/audit-filters.dto'

@Controller({ path: 'admin/audit-logs', version: '1' })
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  // Immutable, read-only. `audit_logs:view` is SUPER_ADMIN-only in the catalog.
  @Get()
  @RequirePermission('audit_logs:view')
  list(@Query() filters: AuditFiltersDto) {
    return this.auditService.list(filters)
  }
}
