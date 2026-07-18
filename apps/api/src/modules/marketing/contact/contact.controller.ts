import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppConfig } from '@/config/configuration'
import { ContactService } from './contact.service'
import { CreateContactDto } from './dto/create-contact.dto'

@Controller('marketing')
export class ContactController {
  constructor(
    private readonly contactService: ContactService,
    private readonly configService: ConfigService<AppConfig>,
  ) {}

  /**
   * Capture a contact-form lead from the marketing site. Public route, self-guarded by the
   * shared internal secret (same as waitlist) — the web app proxies here server-side.
   */
  @Post('contact')
  async create(
    @Body() dto: CreateContactDto,
    @Headers('x-internal-secret') secret: string,
    @Headers('authorization') authHeader: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const expected = this.configService.get('INTERNAL_API_SECRET')
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!expected || (secret?.trim() !== expected && bearerToken?.trim() !== expected)) {
      throw new UnauthorizedException('Invalid internal secret')
    }
    const lead = await this.contactService.create(dto, { userAgent })
    return { success: true, id: lead.id }
  }
}
