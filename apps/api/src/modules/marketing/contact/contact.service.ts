import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ContactLead } from '@/entities/contact-lead.entity'
import { NotificationsService } from '@/modules/notifications/services/notifications.service'
import { CreateContactDto } from './dto/create-contact.dto'

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name)

  constructor(
    @InjectRepository(ContactLead)
    private readonly repo: Repository<ContactLead>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(dto: CreateContactDto, meta: { userAgent?: string }): Promise<ContactLead> {
    const lead = this.repo.create({
      name: dto.name,
      business: dto.business || undefined,
      phone: dto.phone,
      email: dto.email || undefined,
      city: dto.city || undefined,
      topic: dto.topic || undefined,
      message: dto.message,
      consent: dto.consent ?? false,
      locale: dto.locale ?? 'fr',
      user_agent: meta.userAgent?.substring(0, 500),
      status: 'NEW',
    })
    const saved = await this.repo.save(lead)
    this.logger.log(`Contact lead saved: ${saved.id}`)

    // Fire-and-forget: a notification failure must never fail the lead capture.
    await this.notificationsService
      .sendContactLeadNotification(saved)
      .catch((err) => this.logger.error('Contact lead email failed', err))

    return saved
  }
}
