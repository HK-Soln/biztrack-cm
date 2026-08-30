import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MemberAuthCredential } from '@/entities/member-auth-credential.entity'
import { BusinessMember } from '@/entities/business-member.entity'
import { Business } from '@/entities/business.entity'
import { AuditModule } from '@/modules/audit/audit.module'
import { NotificationsModule } from '@/modules/notifications/notifications.module'
import { CredentialsService } from './credentials.service'
import { CredentialsController } from './credentials.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([MemberAuthCredential, BusinessMember, Business]),
    AuditModule,
    NotificationsModule,
  ],
  controllers: [CredentialsController],
  providers: [CredentialsService],
  exports: [CredentialsService],
})
export class CredentialsModule {}
