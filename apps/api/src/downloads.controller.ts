import { Controller, Get, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Response } from 'express'
import { Public } from '@/common/decorators/public.decorator'
import type { AppConfig } from '@/config/configuration'

/**
 * Public "download the latest desktop app" redirect — a stable, brandable URL the landing page
 * links to. It 302-redirects to the newest release asset (GitHub's latest-release download by
 * default; env-configurable via DESKTOP_DOWNLOAD_URL to swap to R2/CDN or store links later).
 */
@Controller('download')
export class DownloadsController {
  constructor(private readonly config: ConfigService<AppConfig>) {}

  @Public()
  @Get('desktop')
  desktop(@Res() res: Response): void {
    res.redirect(302, this.config.get('DESKTOP_DOWNLOAD_URL', { infer: true })!)
  }
}
