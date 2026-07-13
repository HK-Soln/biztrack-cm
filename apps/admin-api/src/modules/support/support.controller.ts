import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { RequirePermission } from '@/common/decorators/require-permission.decorator'
import { AuditAction } from '@/common/decorators/audit-action.decorator'
import { CurrentAdmin } from '@/common/decorators/current-admin.decorator'
import type { AdminJwtPayload } from '@/common/auth/admin-jwt-payload'
import { SupportService } from './support.service'
import { CreateTicketDto } from './dto/create-ticket.dto'
import { UpdateTicketDto } from './dto/update-ticket.dto'
import { TicketFiltersDto } from './dto/ticket-filters.dto'

@Controller({ path: 'admin/support', version: '1' })
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('tickets')
  @RequirePermission('support:view')
  listTickets(@Query() filters: TicketFiltersDto) {
    return this.supportService.listTickets(filters)
  }

  @Post('tickets')
  @RequirePermission('support:create_ticket')
  @AuditAction('SUPPORT_TICKET_CREATED')
  createTicket(@Body() dto: CreateTicketDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.supportService.createTicket(dto, admin.sub)
  }

  @Patch('tickets/:id')
  @RequirePermission('support:resolve_ticket')
  @AuditAction('SUPPORT_TICKET_UPDATED')
  updateTicket(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTicketDto) {
    return this.supportService.updateTicket(id, dto)
  }

  @Get('sync-errors')
  @RequirePermission('sync_errors:view')
  listSyncErrors() {
    return this.supportService.listSyncErrors()
  }

  @Post('sync-errors/:businessId/resolve')
  @HttpCode(200)
  @RequirePermission('sync_errors:resolve')
  @AuditAction('SYNC_ERRORS_RESOLVED')
  resolveSyncErrors(@Param('businessId', ParseUUIDPipe) businessId: string) {
    return this.supportService.resolveSyncErrors(businessId)
  }
}
