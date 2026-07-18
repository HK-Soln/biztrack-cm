import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PassportModule } from '@nestjs/passport'
import { WaitlistEntry } from '@/entities/waitlist-entry.entity'
import { ContactLead } from '@/entities/contact-lead.entity'
import { WaitlistService } from './waitlist/waitlist.service'
import { WaitlistController } from './waitlist/waitlist.controller'
import { ContactService } from './contact/contact.service'
import { ContactController } from './contact/contact.controller'
import { NotificationsModule } from '@/modules/notifications/notifications.module'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'

@Module({
  imports: [
    TypeOrmModule.forFeature([WaitlistEntry, ContactLead]),
    NotificationsModule,
    PassportModule,
  ],
  controllers: [WaitlistController, ContactController],
  providers: [WaitlistService, ContactService, JwtAuthGuard],
})
export class MarketingModule {}
