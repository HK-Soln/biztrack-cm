import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type {
  IssueSyncTokenResponse,
  JwtPayload,
  SyncBatchStatusResponse,
  SyncPullResponse,
  SyncPushResponse,
} from '@biztrack/types'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { AppUnauthorizedException } from '@/common/exceptions/app-exceptions'
import { AuditService } from '@/modules/audit/audit.service'
import { AuditIngestDto } from '@/modules/audit/dto/audit-ingest.dto'
import { Phase2Guard } from '../auth/guards/phase2.guard'
import { IssueSyncTokenDto } from './dto/issue-sync-token.dto'
import { PullSyncQueryDto } from './dto/pull-sync-query.dto'
import { PushSyncBatchDto } from './dto/push-sync-batch.dto'
import { SyncTokenGuard } from './guards/sync-token.guard'
import { SyncAuthService } from './services/sync-auth.service'
import { SyncService } from './sync.service'

@ApiTags('Sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly syncAuthService: SyncAuthService,
    private readonly auditService: AuditService,
  ) {}

  @Post('token')
  @UseGuards(Phase2Guard)
  @ApiOperation({
    summary: 'Issue a sync-only device token',
    description:
      'The desktop app exchanges a fresh phase2 session for a long-lived device credential that is accepted only by sync HTTP and realtime routes.',
  })
  issueSyncToken(
    @CurrentUser() user: JwtPayload,
    @Body() dto: IssueSyncTokenDto,
  ): Promise<IssueSyncTokenResponse> {
    return this.syncAuthService.issueSyncToken(user, dto)
  }

  @Post('batches')
  @UseGuards(SyncTokenGuard)
  @ApiOperation({
    summary: 'Queue a sync push batch',
    description: 'Stores client sync operations and queues background processing.',
  })
  pushBatch(
    @CurrentUser() user: JwtPayload,
    @Body() dto: PushSyncBatchDto,
  ): Promise<SyncPushResponse> {
    this.assertDeviceBinding(user, dto.deviceId)
    return this.syncService.enqueueBatch(user.businessId as string, user, dto)
  }

  @Get('batches/:batchId')
  @UseGuards(SyncTokenGuard)
  @ApiOperation({ summary: 'Get sync batch processing status' })
  async getBatchStatus(
    @CurrentUser() user: JwtPayload,
    @Param('batchId') batchId: string,
  ): Promise<SyncBatchStatusResponse> {
    return await this.syncService.getBatchStatus(
      user.businessId as string,
      batchId,
      user.deviceId as string,
    )
  }

  @Post('audit')
  @UseGuards(SyncTokenGuard)
  @ApiOperation({
    summary: 'Ingest a batch of device audit rows (desktop→server audit bridge)',
    description:
      'Append-only ingest of local_audit_logs rows. Idempotent (re-push safe); server stamps the ingest time and normalises the actor type.',
  })
  ingestAudit(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AuditIngestDto,
  ): Promise<{ ingested: number }> {
    this.assertDeviceBinding(user, dto.deviceId)
    return this.auditService.ingestBatch(user.businessId ?? null, user.deviceId ?? null, dto.rows)
  }

  @Get('pull')
  @UseGuards(SyncTokenGuard)
  @ApiOperation({
    summary: 'Pull server-side catalog changes',
    description: 'Returns products, categories, and units changed since the provided cursor.',
  })
  pullChanges(
    @CurrentUser() user: JwtPayload,
    @Query() query: PullSyncQueryDto,
  ): Promise<SyncPullResponse> {
    return this.syncService.pullChanges(user.businessId as string, query.cursor ?? null)
  }

  private assertDeviceBinding(user: JwtPayload, deviceId: string) {
    if (!user.deviceId || user.deviceId !== deviceId) {
      throw new AppUnauthorizedException(
        'Sync request device does not match the issued sync token.',
        'SYNC_DEVICE_MISMATCH',
      )
    }
  }
}
