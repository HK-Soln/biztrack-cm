import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MemberAuthCredential } from '@/entities/member-auth-credential.entity'
import { BusinessMember } from '@/entities/business-member.entity'
import { AuditModule } from '@/modules/audit/audit.module'
import { CredentialsService } from './credentials.service'

@Module({
  imports: [TypeOrmModule.forFeature([MemberAuthCredential, BusinessMember]), AuditModule],
  providers: [CredentialsService],
  exports: [CredentialsService],
})
export class CredentialsModule {}
