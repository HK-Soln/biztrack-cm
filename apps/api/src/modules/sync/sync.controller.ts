import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { SyncService } from './sync.service'
import { SyncPayloadDto } from './dto/sync-payload.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import type { ChangeSet, JwtPayload } from '@biztrack/types'

@ApiTags('Sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private syncService: SyncService) {}

  @Post()
  @ApiOperation({
    summary: 'Sync device changes with server',
    description: 'Push local changes and pull server changes in a single request. Last-write-wins conflict resolution.',
  })
  sync(@CurrentUser() user: JwtPayload, @Body() dto: SyncPayloadDto) {
    return this.syncService.sync(user.businessId as string, {
      deviceId: dto.deviceId,
      lastSyncedAt: dto.lastSyncedAt,
      changes: dto.changes as unknown as ChangeSet, 
      businessId: user.businessId as string,
    })
  }
}
