import { Controller, Get, Req, Res } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { AppBadRequestException, AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { StorageService } from './storage.service'

/**
 * Interim private-file access. `GET /api/v1/files/<key>` 302-redirects to a short-lived
 * presigned URL (S3/R2) or to the statically-served file (local driver). This lets us
 * flip the R2 bucket private and test presigned delivery WITHOUT yet doing the full
 * streaming/visibility/cache overhaul or the entity-URL migration.
 *
 * NOTE (temporary posture): no auth and no public/private split yet — access relies on
 * keys being unguessable UUIDs, which is no weaker than today's public bucket. Real
 * per-user authorization + a public/private prefix policy land with the full migration.
 */
@ApiTags('Files')
@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Get('*')
  @ApiOperation({ summary: 'Redirect to a presigned URL for a stored file (interim).' })
  async serve(@Req() req: Request, @Res() res: Response): Promise<void> {
    // Express 4 wildcard: the matched path lives in params[0], e.g. '<businessId>/products/<uuid>.jpg'.
    const key = decodeURIComponent(String(req.params[0] ?? '')).replace(/^\/+/, '')
    if (!key) {
      throw new AppBadRequestException('File key is required.', 'FILE_KEY_REQUIRED')
    }
    if (!(await this.storage.exists(key))) {
      throw new AppNotFoundException('File not found.', 'FILE_NOT_FOUND')
    }
    res.redirect(302, await this.storage.presignGet(key))
  }
}
